import { transactionDeadlineMs, useWalletRequest } from "./useWalletRequest";
import { AccountId, Hbar, TransactionId, TransferTransaction } from "@hiero-ledger/sdk";
import { QueryClient } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "~~/hooks/mirror/testUtils";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { WalletRequestExpiredError } from "~~/services/web3/hederaSigner";

vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: vi.fn() }));

const PAYER = "0.0.1234";
const STEP = { action: "schedule", step: 2, steps: 2 } as const;
const EXECUTED = { transactionId: `${PAYER}@1.0` };

const transfer = () =>
  new TransferTransaction()
    .addHbarTransfer(AccountId.fromString("0.0.1"), Hbar.fromTinybars(-1))
    .addHbarTransfer(AccountId.fromString("0.0.2"), Hbar.fromTinybars(1));

/** A wallet that answers only when the test says so, as HashPack does while a request sits in it. */
const walletHoldingTheRequest = () => {
  const answer = Promise.withResolvers<typeof EXECUTED>();
  const executeTransaction = vi.fn().mockReturnValue(answer.promise);
  vi.mocked(useHederaSigner).mockReturnValue({
    executeTransaction,
    requireAccountId: () => PAYER,
    signerKind: "hashpack",
  } as never);
  return { answer, executeTransaction };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useWalletRequest", () => {
  it("gives the transaction its id before asking the wallet, so its deadline is known", () => {
    const { executeTransaction } = walletHoldingTheRequest();
    const tx = transfer();
    const { result } = renderHook(() => useWalletRequest(), { wrapper: createQueryWrapper() });

    act(() => void result.current.executeStep(tx, STEP).catch(() => undefined));

    expect(executeTransaction).toHaveBeenCalledWith(tx);
    expect(tx.transactionId?.accountId?.toString()).toBe(PAYER);
    // The deadline is the transaction's own: its valid start plus its valid duration.
    const validStartMs = tx.transactionId!.validStart!.toDate().getTime();
    expect(transactionDeadlineMs(tx) - validStartMs).toBe(tx.transactionValidDuration * 1000);
    expect(result.current.walletRequest).toEqual({ ...STEP, validForSeconds: tx.transactionValidDuration });
  });

  it("keeps a transaction id set before, so the deadline is that id's", () => {
    walletHoldingTheRequest();
    const preset = TransactionId.generate(AccountId.fromString("0.0.777"));
    const tx = transfer().setTransactionId(preset);
    const { result } = renderHook(() => useWalletRequest(), { wrapper: createQueryWrapper() });

    act(() => void result.current.executeStep(tx, STEP).catch(() => undefined));

    expect(tx.transactionId?.toString()).toBe(preset.toString());
  });

  it("leaves the test signer to the SDK: no id preset, no deadline, so its own retry on expiry still works", async () => {
    const executeTransaction = vi.fn().mockResolvedValue(EXECUTED);
    vi.mocked(useHederaSigner).mockReturnValue({
      executeTransaction,
      requireAccountId: () => PAYER,
      signerKind: "burner",
    } as never);
    const tx = transfer();
    const { result } = renderHook(() => useWalletRequest(), { wrapper: createQueryWrapper() });

    let outcome: Promise<unknown> = Promise.resolve();
    act(() => {
      outcome = result.current.executeStep(tx, STEP);
    });

    await expect(outcome).resolves.toEqual(EXECUTED);
    expect(vi.getTimerCount()).toBe(0);
    expect(tx.transactionId).toBeNull();
  });

  it("answers as the wallet does before the deadline, and leaves no timer behind", async () => {
    const { answer } = walletHoldingTheRequest();
    const { result } = renderHook(() => useWalletRequest(), { wrapper: createQueryWrapper() });

    let outcome: Promise<unknown> = Promise.resolve();
    act(() => {
      outcome = result.current.executeStep(transfer(), STEP);
    });
    await act(async () => answer.resolve(EXECUTED));

    await expect(outcome).resolves.toEqual(EXECUTED);
    expect(result.current.walletRequest).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops waiting at the deadline of a request the wallet never answers", async () => {
    walletHoldingTheRequest();
    const tx = transfer();
    const { result } = renderHook(() => useWalletRequest(), { wrapper: createQueryWrapper() });

    let outcome: Promise<unknown> = Promise.resolve();
    act(() => {
      outcome = result.current.executeStep(tx, STEP).catch((error: unknown) => error);
    });
    const untilDeadline = transactionDeadlineMs(tx) - Date.now();

    await act(() => vi.advanceTimersByTimeAsync(untilDeadline - 1));
    expect(result.current.walletRequest).not.toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(1));
    const error = await outcome;
    expect(error).toBeInstanceOf(WalletRequestExpiredError);
    expect((error as WalletRequestExpiredError).validForSeconds).toBe(tx.transactionValidDuration);
    expect(result.current.walletRequest).toBeNull();
  });

  it("keeps a success that arrives after the deadline, refreshing every read, instead of dropping it", async () => {
    const { answer } = walletHoldingTheRequest();
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const onLateSuccess = vi.fn();
    const tx = transfer();
    const { result } = renderHook(() => useWalletRequest(), { wrapper: createQueryWrapper(queryClient) });

    let outcome: Promise<unknown> = Promise.resolve();
    act(() => {
      outcome = result.current.executeStep(tx, STEP, onLateSuccess).catch((error: unknown) => error);
    });
    await act(() => vi.advanceTimersByTimeAsync(transactionDeadlineMs(tx) - Date.now()));
    expect(await outcome).toBeInstanceOf(WalletRequestExpiredError);

    await act(async () => answer.resolve(EXECUTED));

    expect(onLateSuccess).toHaveBeenCalledWith(EXECUTED);
    expect(invalidate).toHaveBeenCalled();
    expect(result.current.lateSubmission).toEqual({ ...STEP, transactionId: EXECUTED.transactionId });
  });

  it("stays quiet when the wallet is refused after the deadline, which is the expected answer", async () => {
    const { answer } = walletHoldingTheRequest();
    const onLateSuccess = vi.fn();
    const tx = transfer();
    const { result } = renderHook(() => useWalletRequest(), { wrapper: createQueryWrapper() });

    act(() => void result.current.executeStep(tx, STEP, onLateSuccess).catch(() => undefined));
    await act(() => vi.advanceTimersByTimeAsync(transactionDeadlineMs(tx) - Date.now()));
    await act(async () => answer.reject(new Error("failed precheck with status TRANSACTION_EXPIRED")));

    expect(onLateSuccess).not.toHaveBeenCalled();
    expect(result.current.lateSubmission).toBeNull();
  });
});
