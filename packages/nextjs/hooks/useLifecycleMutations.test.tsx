import { useCancelProposal } from "./useCancelProposal";
import { ScheduleSignRefusedError, useSignProposal, useSignatureInFlight } from "./useSignProposal";
import { ScheduleDeleteRefusedError, useWithdrawProposal } from "./useWithdrawProposal";
import { type MirrorTransaction, fetchTransaction } from "@sh/core/mirror";
import { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "~~/hooks/mirror/testUtils";
import { proposalInboxQueryKey } from "~~/hooks/mirror/useProposals";
import { useHederaSigner } from "~~/hooks/useHederaSigner";

vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: vi.fn() }));
vi.mock("@sh/core/mirror", async importOriginal => ({
  ...(await importOriginal<typeof import("@sh/core/mirror")>()),
  fetchTransaction: vi.fn(),
}));
// Poll without waiting, so the not-yet-indexed path runs at test speed.
vi.mock("~~/utils/scaffold-hbar/waitForMirrorIndexing", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/utils/scaffold-hbar/waitForMirrorIndexing")>()),
  MIRROR_INDEXING_RETRY_DELAYS_MS: [0, 0],
}));

/** The Mirror row a ScheduleDelete leaves, with the result consensus gave it. */
const deleteRow = (result: string) => [{ name: "SCHEDULEDELETE", result }] as unknown as MirrorTransaction[];

const SCHEDULE_ID = "0.0.10714227";
const EXECUTOR_CONTRACT_ID = "0.0.10671250";

/** The Mirror row a ScheduleSign leaves, with the result consensus gave it. */
const signRow = (result: string) => [{ name: "SCHEDULESIGN", result }] as unknown as MirrorTransaction[];

describe("useSignProposal", () => {
  const renderSign = (queryClient = new QueryClient()) => {
    vi.mocked(useHederaSigner).mockReturnValue({
      executeTransaction: vi.fn().mockResolvedValue({ transactionId: "0.0.1@1.0" }),
      requireAccountId: () => "0.0.1",
    } as never);
    return renderHook(() => useSignProposal(), { wrapper: createQueryWrapper(queryClient) }).result;
  };

  it("signs the given schedule", async () => {
    const executeTransaction = vi.fn().mockResolvedValue({ transactionId: "0.0.1@1.0" });
    vi.mocked(useHederaSigner).mockReturnValue({ executeTransaction, requireAccountId: () => "0.0.1" } as never);
    vi.mocked(fetchTransaction).mockReset().mockResolvedValue(signRow("SUCCESS"));

    const { result } = renderHook(() => useSignProposal(), { wrapper: createQueryWrapper() });
    result.current.mutate(SCHEDULE_ID);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(executeTransaction).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: expect.anything() }));
  });

  it("succeeds once Mirror lists the signature, then re-reads the inbox at once", async () => {
    vi.mocked(fetchTransaction).mockReset().mockResolvedValueOnce([]).mockResolvedValue(signRow("SUCCESS"));
    const queryClient = new QueryClient();
    const refetch = vi.spyOn(queryClient, "refetchQueries");
    const result = renderSign(queryClient);

    await act(() => result.current.mutateAsync(SCHEDULE_ID));

    expect(fetchTransaction).toHaveBeenCalledWith("0.0.1@1.0", expect.anything());
    expect(refetch).toHaveBeenCalledWith({ queryKey: proposalInboxQueryKey("testnet") });
  });

  it("says the network refused the signature, with its result, rather than succeeding", async () => {
    vi.mocked(fetchTransaction).mockReset().mockResolvedValue(signRow("SCHEDULE_ALREADY_EXECUTED"));
    const result = renderSign();

    act(() => result.current.mutate(SCHEDULE_ID));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ScheduleSignRefusedError);
    expect(result.current.error?.message).toContain("SCHEDULE_ALREADY_EXECUTED");
  });

  it("fails, naming the transaction, when Mirror never lists the signature", async () => {
    vi.mocked(fetchTransaction).mockReset().mockResolvedValue([]);
    const result = renderSign();

    act(() => result.current.mutate(SCHEDULE_ID));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/0\.0\.1@1\.0.*not on Mirror yet/);
    expect(result.current.isConfirming).toBe(false);
  });

  it("is confirming only between the wallet's answer and the signature's row", async () => {
    let answer: (rows: MirrorTransaction[]) => void = () => undefined;
    vi.mocked(fetchTransaction)
      .mockReset()
      .mockReturnValue(new Promise(resolve => (answer = resolve)));
    const result = renderSign();
    expect(result.current.isConfirming).toBe(false);

    act(() => result.current.mutate(SCHEDULE_ID));

    await waitFor(() => expect(result.current.isConfirming).toBe(true));
    await act(async () => answer(signRow("SUCCESS")));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.isConfirming).toBe(false);
  });
});

describe("useSignatureInFlight", () => {
  it("is true for a schedule while its signature is on its way, and for no other", async () => {
    let answer: (rows: MirrorTransaction[]) => void = () => undefined;
    vi.mocked(fetchTransaction)
      .mockReset()
      .mockReturnValue(new Promise(resolve => (answer = resolve)));
    vi.mocked(useHederaSigner).mockReturnValue({
      executeTransaction: vi.fn().mockResolvedValue({ transactionId: "0.0.1@1.0" }),
      requireAccountId: () => "0.0.1",
    } as never);
    const wrapper = createQueryWrapper(new QueryClient());
    const { result } = renderHook(
      () => ({
        sign: useSignProposal(),
        this: useSignatureInFlight(SCHEDULE_ID),
        other: useSignatureInFlight("0.0.2"),
      }),
      { wrapper },
    );

    act(() => result.current.sign.mutate(SCHEDULE_ID));

    await waitFor(() => expect(result.current.this).toBe(true));
    expect(result.current.other).toBe(false);
    await act(async () => answer(signRow("SUCCESS")));
    await waitFor(() => expect(result.current.this).toBe(false));
  });
});

describe("useWithdrawProposal", () => {
  const withdrawWith = (rows: MirrorTransaction[] | null) => {
    vi.mocked(useHederaSigner).mockReturnValue({
      executeTransaction: vi.fn().mockResolvedValue({ transactionId: "0.0.1@1.0" }),
      requireAccountId: () => "0.0.1",
    } as never);
    vi.mocked(fetchTransaction).mockReset();
    if (rows) vi.mocked(fetchTransaction).mockResolvedValue(rows);
    else vi.mocked(fetchTransaction).mockResolvedValue([]);
    const { result } = renderHook(() => useWithdrawProposal(), { wrapper: createQueryWrapper() });
    result.current.mutate(SCHEDULE_ID);
    return result;
  };

  it("deletes the given schedule", async () => {
    const executeTransaction = vi.fn().mockResolvedValue({ transactionId: "0.0.1@1.0" });
    vi.mocked(useHederaSigner).mockReturnValue({ executeTransaction, requireAccountId: () => "0.0.1" } as never);
    vi.mocked(fetchTransaction).mockResolvedValue(deleteRow("SUCCESS"));

    const { result } = renderHook(() => useWithdrawProposal(), { wrapper: createQueryWrapper() });
    result.current.mutate(SCHEDULE_ID);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(executeTransaction).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: expect.anything() }));
    const txArg = executeTransaction.mock.calls[0][0];
    expect(txArg.scheduleId?.toString()).toBe(SCHEDULE_ID);
    expect(fetchTransaction).toHaveBeenCalledWith("0.0.1@1.0", expect.anything());
  });

  it("fails when the network refused the delete at consensus, since the schedule is still live", async () => {
    const result = withdrawWith(deleteRow("INVALID_SIGNATURE"));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ScheduleDeleteRefusedError);
    expect(result.current.error?.message).toContain("INVALID_SIGNATURE");
  });

  it("counts a schedule another delete already removed as withdrawn", async () => {
    const result = withdrawWith(deleteRow("SCHEDULE_ALREADY_DELETED"));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("fails, naming the transaction, when Mirror never shows the delete", async () => {
    const result = withdrawWith(null);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/0\.0\.1@1\.0.*not confirmed/);
  });
});

describe("useCancelProposal", () => {
  it("cancels the given registry proposal", async () => {
    const executeTransaction = vi.fn().mockResolvedValue({ transactionId: "0.0.1@1.0" });
    vi.mocked(useHederaSigner).mockReturnValue({ executeTransaction, requireAccountId: () => "0.0.1" } as never);

    const { result } = renderHook(() => useCancelProposal(), { wrapper: createQueryWrapper() });
    result.current.mutate({ executorContractId: EXECUTOR_CONTRACT_ID, registryProposalId: 3 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(executeTransaction).toHaveBeenCalledWith(expect.objectContaining({ contractId: expect.anything() }));
    const txArg = executeTransaction.mock.calls[0][0];
    expect(txArg.contractId?.toString()).toBe(EXECUTOR_CONTRACT_ID);
  });
});
