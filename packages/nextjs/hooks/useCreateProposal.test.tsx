import { useCreateProposal } from "./useCreateProposal";
import { PrivateKey } from "@hiero-ledger/sdk";
import { MirrorNodeError, fetchContractResult, fetchTransaction } from "@sh/core/mirror";
import { QueryClient } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "~~/hooks/mirror/testUtils";
import { proposalInboxQueryKey } from "~~/hooks/mirror/useProposals";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { TransactionExpiredError, WalletRequestExpiredError } from "~~/services/web3/hederaSigner";

vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: vi.fn() }));
vi.mock("@sh/core/mirror", async importOriginal => ({
  ...(await importOriginal<typeof import("@sh/core/mirror")>()),
  fetchTransaction: vi.fn(),
  fetchContractResult: vi.fn(),
  fetchAccount: vi.fn(),
}));
vi.mock("~~/config/governanceConfig", () => ({
  getGovernanceEntityIds: () => ({ governanceAccountId: "0.0.10671146", demoTokenId: "0.0.1", seedProposalId: 1 }),
}));

// Poll without waiting, so the retry path runs at test speed.
vi.mock("~~/utils/scaffold-hbar/waitForMirrorIndexing", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/utils/scaffold-hbar/waitForMirrorIndexing")>()),
  MIRROR_INDEXING_RETRY_DELAYS_MS: [0, 0, 0],
}));

const EXECUTOR_CONTRACT_ID = "0.0.10671250";
const PROPOSER_ID = "0.0.10671147";
const proposal = {
  target: "0x1111111111111111111111111111111111111111" as const,
  calldata: "0x1234" as const,
  registerGas: 150_000,
  executeGas: 90_000,
  payableTinybars: 0n,
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.mocked(fetchTransaction).mockReset();
  vi.mocked(fetchContractResult).mockReset();
});

describe("useCreateProposal", () => {
  it("gives up after polling, naming the registration transaction so it is not registered twice", async () => {
    const executeTransaction = vi
      .fn()
      .mockResolvedValueOnce({ transactionId: `${PROPOSER_ID}@1.0` })
      .mockResolvedValueOnce({ transactionId: `${PROPOSER_ID}@2.0` });
    vi.mocked(useHederaSigner).mockReturnValue({ executeTransaction, requireAccountId: () => PROPOSER_ID } as never);

    const { fetchAccount } = await import("@sh/core/mirror");
    vi.mocked(fetchAccount).mockResolvedValue({
      key: { _type: "ECDSA_SECP256K1", key: PrivateKey.generateECDSA().publicKey.toStringRaw() },
    } as never);
    // No return value recorded yet — exercises the "Mirror lag" path, not "createProposal reverted".
    vi.mocked(fetchContractResult).mockResolvedValue({ call_result: "0x", error_message: null } as never);
    vi.mocked(fetchTransaction).mockResolvedValue([
      { transaction_id: `${PROPOSER_ID}-2-0`, name: "SCHEDULECREATE", entity_id: "0.0.999" } as never,
    ]);

    const { result } = renderHook(() => useCreateProposal(), { wrapper: createQueryWrapper() });

    result.current.mutate({ executorContractId: EXECUTOR_CONTRACT_ID, proposal, memo: "test proposal" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/not yet indexed/i);
    expect(result.current.error?.message).toContain(`${PROPOSER_ID}@1.0`);
    // One registration only, however many times Mirror was read.
    expect(executeTransaction).toHaveBeenCalledTimes(1);
    expect(fetchContractResult).toHaveBeenCalledTimes(4);
  });

  it("waits out Mirror's lag, schedules the execute call, returns both ids and refreshes the inbox", async () => {
    const executeTransaction = vi
      .fn()
      .mockResolvedValueOnce({ transactionId: `${PROPOSER_ID}@1.0` })
      .mockResolvedValueOnce({ transactionId: `${PROPOSER_ID}@2.0` });
    vi.mocked(useHederaSigner).mockReturnValue({ executeTransaction, requireAccountId: () => PROPOSER_ID } as never);

    const { fetchAccount } = await import("@sh/core/mirror");
    vi.mocked(fetchAccount).mockResolvedValue({
      key: { _type: "ECDSA_SECP256K1", key: PrivateKey.generateECDSA().publicKey.toStringRaw() },
    } as never);
    vi.mocked(fetchContractResult)
      .mockRejectedValueOnce(new MirrorNodeError(404, "url", "not found"))
      .mockResolvedValue({ call_result: `0x${"0".repeat(63)}5`, error_message: null } as never);
    vi.mocked(fetchTransaction)
      .mockRejectedValueOnce(new MirrorNodeError(404, "url", "not found"))
      .mockResolvedValue([
        { transaction_id: `${PROPOSER_ID}-2-0`, name: "SCHEDULECREATE", entity_id: "0.0.999" } as never,
      ]);

    const queryClient = new QueryClient();
    const inboxKey = [...proposalInboxQueryKey("testnet"), "0.0.10671146", EXECUTOR_CONTRACT_ID];
    queryClient.setQueryData(inboxKey, "inbox");

    const { result } = renderHook(() => useCreateProposal(), { wrapper: createQueryWrapper(queryClient) });
    result.current.mutate({ executorContractId: EXECUTOR_CONTRACT_ID, proposal, memo: "test proposal" });

    await waitFor(() => expect(result.current.data).toEqual({ registryProposalId: 5, scheduleId: "0.0.999" }));
    expect(queryClient.getQueryState(inboxKey)?.isInvalidated).toBe(true);
  });

  it("stops polling at once when the registration reverted", async () => {
    const executeTransaction = vi.fn().mockResolvedValueOnce({ transactionId: `${PROPOSER_ID}@1.0` });
    vi.mocked(useHederaSigner).mockReturnValue({ executeTransaction, requireAccountId: () => PROPOSER_ID } as never);
    vi.mocked(fetchContractResult).mockResolvedValue({
      call_result: "0x",
      error_message: "CONTRACT_REVERT_EXECUTED",
    } as never);

    const { result } = renderHook(() => useCreateProposal(), { wrapper: createQueryWrapper() });
    result.current.mutate({ executorContractId: EXECUTOR_CONTRACT_ID, proposal, memo: "test proposal" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/failed on chain/);
    expect(fetchContractResult).toHaveBeenCalledTimes(1);
  });

  it("says which of the two requests the wallet holds, and for how long, until it answers", async () => {
    const answers = [
      Promise.withResolvers<{ transactionId: string }>(),
      Promise.withResolvers<{ transactionId: string }>(),
    ];
    const executeTransaction = vi.fn().mockReturnValueOnce(answers[0].promise).mockReturnValueOnce(answers[1].promise);
    vi.mocked(useHederaSigner).mockReturnValue({ executeTransaction, requireAccountId: () => PROPOSER_ID } as never);
    const { fetchAccount } = await import("@sh/core/mirror");
    vi.mocked(fetchAccount).mockResolvedValue({
      key: { _type: "ECDSA_SECP256K1", key: PrivateKey.generateECDSA().publicKey.toStringRaw() },
    } as never);
    vi.mocked(fetchContractResult).mockResolvedValue({
      call_result: `0x${"0".repeat(63)}5`,
      error_message: null,
    } as never);
    vi.mocked(fetchTransaction).mockResolvedValue([
      { transaction_id: `${PROPOSER_ID}-2-0`, name: "SCHEDULECREATE", entity_id: "0.0.999" } as never,
    ]);

    const { result } = renderHook(() => useCreateProposal(), { wrapper: createQueryWrapper() });
    expect(result.current.walletRequest).toBeNull();
    result.current.mutate({ executorContractId: EXECUTOR_CONTRACT_ID, proposal, memo: "test proposal" });

    // The SDK's default valid duration, read from the transaction rather than restated here.
    await waitFor(() =>
      expect(result.current.walletRequest).toEqual({ action: "register", step: 1, steps: 2, validForSeconds: 120 }),
    );
    answers[0].resolve({ transactionId: `${PROPOSER_ID}@1.0` });
    await waitFor(() => expect(result.current.walletRequest).toMatchObject({ action: "schedule", step: 2, steps: 2 }));
    answers[1].resolve({ transactionId: `${PROPOSER_ID}@2.0` });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.walletRequest).toBeNull();
  });

  describe("after the registration succeeded and the schedule did not", () => {
    const REGISTERED = { call_result: `0x${"0".repeat(62)}0c`, error_message: null };

    const signerWith = (executeTransaction: ReturnType<typeof vi.fn>) =>
      vi.mocked(useHederaSigner).mockReturnValue({ executeTransaction, requireAccountId: () => PROPOSER_ID } as never);

    const proposerKeyOnMirror = async () => {
      const { fetchAccount } = await import("@sh/core/mirror");
      vi.mocked(fetchAccount).mockResolvedValue({
        key: { _type: "ECDSA_SECP256K1", key: PrivateKey.generateECDSA().publicKey.toStringRaw() },
      } as never);
    };

    it("keeps the entry, and a retry of the same call only schedules it", async () => {
      await proposerKeyOnMirror();
      const executeTransaction = vi
        .fn()
        .mockResolvedValueOnce({ transactionId: `${PROPOSER_ID}@1.0` })
        .mockRejectedValueOnce(new Error("User rejected the request"))
        .mockResolvedValueOnce({ transactionId: `${PROPOSER_ID}@3.0` });
      signerWith(executeTransaction);
      vi.mocked(fetchContractResult).mockResolvedValue(REGISTERED as never);
      vi.mocked(fetchTransaction).mockResolvedValue([
        { transaction_id: `${PROPOSER_ID}-3-0`, name: "SCHEDULECREATE", entity_id: "0.0.999" } as never,
      ]);

      const { result } = renderHook(() => useCreateProposal(), { wrapper: createQueryWrapper() });
      result.current.mutate({ executorContractId: EXECUTOR_CONTRACT_ID, proposal, memo: "test proposal" });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.unscheduledEntry).toMatchObject({
        registrationTransactionId: `${PROPOSER_ID}@1.0`,
        registryProposalId: 12,
      });

      result.current.mutate({ executorContractId: EXECUTOR_CONTRACT_ID, proposal, memo: "test proposal" });

      await waitFor(() => expect(result.current.data).toEqual({ registryProposalId: 12, scheduleId: "0.0.999" }));
      // One createProposal, two ScheduleCreate attempts; the id was read once.
      expect(executeTransaction).toHaveBeenCalledTimes(3);
      // The SDK here and in core are separate copies, so the kind of transaction is told by its methods.
      const isSchedule = (call: unknown[]) => "setScheduledTransaction" in (call[0] as object);
      expect(executeTransaction.mock.calls.map(isSchedule)).toEqual([false, true, true]);
      expect(fetchContractResult).toHaveBeenCalledTimes(1);
      expect(result.current.unscheduledEntry).toBeNull();
    });

    it("keeps the entry when the schedule expired in the wallet, and the retry is a single request", async () => {
      await proposerKeyOnMirror();
      const retry = Promise.withResolvers<{ transactionId: string }>();
      const executeTransaction = vi
        .fn()
        .mockResolvedValueOnce({ transactionId: `${PROPOSER_ID}@1.0` })
        .mockRejectedValueOnce(new TransactionExpiredError(120))
        .mockReturnValueOnce(retry.promise);
      signerWith(executeTransaction);
      vi.mocked(fetchContractResult).mockResolvedValue(REGISTERED as never);
      vi.mocked(fetchTransaction).mockResolvedValue([
        { transaction_id: `${PROPOSER_ID}-3-0`, name: "SCHEDULECREATE", entity_id: "0.0.999" } as never,
      ]);

      const { result } = renderHook(() => useCreateProposal(), { wrapper: createQueryWrapper() });
      result.current.mutate({ executorContractId: EXECUTOR_CONTRACT_ID, proposal, memo: "test proposal" });

      await waitFor(() => expect(result.current.error).toBeInstanceOf(TransactionExpiredError));
      expect(result.current.unscheduledEntry).toMatchObject({ registryProposalId: 12 });
      expect(result.current.walletRequest).toBeNull();

      result.current.mutate({ executorContractId: EXECUTOR_CONTRACT_ID, proposal, memo: "test proposal" });
      await waitFor(() =>
        expect(result.current.walletRequest).toMatchObject({ action: "schedule", step: 1, steps: 1 }),
      );
      retry.resolve({ transactionId: `${PROPOSER_ID}@3.0` });

      await waitFor(() => expect(result.current.data).toEqual({ registryProposalId: 12, scheduleId: "0.0.999" }));
    });

    it("keeps a registration HashPack sent after the wizard stopped waiting, so a retry only schedules it", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const late = Promise.withResolvers<{ transactionId: string }>();
      const executeTransaction = vi.fn().mockReturnValueOnce(late.promise);
      signerWith(executeTransaction);

      const { result } = renderHook(() => useCreateProposal(), { wrapper: createQueryWrapper() });
      result.current.mutate({ executorContractId: EXECUTOR_CONTRACT_ID, proposal, memo: "test proposal" });
      await waitFor(() => expect(result.current.walletRequest).toMatchObject({ action: "register" }));

      // Past any transaction's valid duration: the request is abandoned and reported as expired.
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      await waitFor(() => expect(result.current.error).toBeInstanceOf(WalletRequestExpiredError));
      expect(result.current.unscheduledEntry).toBeNull();

      late.resolve({ transactionId: `${PROPOSER_ID}@1.0` });
      await waitFor(() =>
        expect(result.current.unscheduledEntry).toMatchObject({ registrationTransactionId: `${PROPOSER_ID}@1.0` }),
      );
      expect(result.current.lateSubmission).toMatchObject({ action: "register", step: 1, steps: 2 });
    });

    it("never lets a late registration replace the entry a retry already kept", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      await proposerKeyOnMirror();
      const late = Promise.withResolvers<{ transactionId: string }>();
      const executeTransaction = vi
        .fn()
        .mockReturnValueOnce(late.promise)
        .mockResolvedValueOnce({ transactionId: `${PROPOSER_ID}@2.0` })
        .mockRejectedValueOnce(new Error("User rejected the request"));
      signerWith(executeTransaction);
      vi.mocked(fetchContractResult).mockResolvedValue(REGISTERED as never);

      const { result } = renderHook(() => useCreateProposal(), { wrapper: createQueryWrapper() });
      result.current.mutate({ executorContractId: EXECUTOR_CONTRACT_ID, proposal, memo: "test proposal" });
      await waitFor(() => expect(result.current.walletRequest).toMatchObject({ action: "register" }));
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      await waitFor(() => expect(result.current.error).toBeInstanceOf(WalletRequestExpiredError));

      // The retry registers again (the first had not come back) and keeps that entry.
      result.current.mutate({ executorContractId: EXECUTOR_CONTRACT_ID, proposal, memo: "test proposal" });
      await waitFor(() => expect(result.current.isError).toBe(true));
      await waitFor(() =>
        expect(result.current.unscheduledEntry).toMatchObject({ registrationTransactionId: `${PROPOSER_ID}@2.0` }),
      );

      late.resolve({ transactionId: `${PROPOSER_ID}@1.0` });
      await waitFor(() => expect(result.current.lateSubmission).toMatchObject({ action: "register" }));
      expect(result.current.unscheduledEntry).toMatchObject({ registrationTransactionId: `${PROPOSER_ID}@2.0` });
    });

    it("forgets the entry once a schedule HashPack sent after the deadline went through", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      await proposerKeyOnMirror();
      const lateSchedule = Promise.withResolvers<{ transactionId: string }>();
      const executeTransaction = vi
        .fn()
        .mockResolvedValueOnce({ transactionId: `${PROPOSER_ID}@1.0` })
        .mockReturnValueOnce(lateSchedule.promise);
      signerWith(executeTransaction);
      vi.mocked(fetchContractResult).mockResolvedValue(REGISTERED as never);

      const { result } = renderHook(() => useCreateProposal(), { wrapper: createQueryWrapper() });
      result.current.mutate({ executorContractId: EXECUTOR_CONTRACT_ID, proposal, memo: "test proposal" });
      await waitFor(() => expect(result.current.walletRequest).toMatchObject({ action: "schedule" }));
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      await waitFor(() => expect(result.current.error).toBeInstanceOf(WalletRequestExpiredError));
      expect(result.current.unscheduledEntry).toMatchObject({ registryProposalId: 12 });

      lateSchedule.resolve({ transactionId: `${PROPOSER_ID}@2.0` });
      await waitFor(() => expect(result.current.unscheduledEntry).toBeNull());
      expect(result.current.lateSubmission).toMatchObject({ action: "schedule", step: 2, steps: 2 });
    });

    it("reads the id of a registration Mirror had not indexed, instead of registering again", async () => {
      await proposerKeyOnMirror();
      const executeTransaction = vi
        .fn()
        .mockResolvedValueOnce({ transactionId: `${PROPOSER_ID}@1.0` })
        .mockResolvedValueOnce({ transactionId: `${PROPOSER_ID}@2.0` });
      signerWith(executeTransaction);
      vi.mocked(fetchContractResult)
        .mockResolvedValueOnce({ call_result: "0x", error_message: null } as never)
        .mockResolvedValueOnce({ call_result: "0x", error_message: null } as never)
        .mockResolvedValueOnce({ call_result: "0x", error_message: null } as never)
        .mockResolvedValueOnce({ call_result: "0x", error_message: null } as never)
        .mockResolvedValue(REGISTERED as never);
      vi.mocked(fetchTransaction).mockResolvedValue([
        { transaction_id: `${PROPOSER_ID}-2-0`, name: "SCHEDULECREATE", entity_id: "0.0.999" } as never,
      ]);

      const { result } = renderHook(() => useCreateProposal(), { wrapper: createQueryWrapper() });
      result.current.mutate({ executorContractId: EXECUTOR_CONTRACT_ID, proposal, memo: "test proposal" });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.unscheduledEntry).toMatchObject({ registryProposalId: null });

      result.current.mutate({ executorContractId: EXECUTOR_CONTRACT_ID, proposal, memo: "test proposal" });

      await waitFor(() => expect(result.current.data?.registryProposalId).toBe(12));
      expect(executeTransaction).toHaveBeenCalledTimes(2);
    });

    it("registers a different call anew, leaving the earlier entry alone", async () => {
      await proposerKeyOnMirror();
      const executeTransaction = vi
        .fn()
        .mockResolvedValueOnce({ transactionId: `${PROPOSER_ID}@1.0` })
        .mockRejectedValueOnce(new Error("User rejected the request"))
        .mockResolvedValue({ transactionId: `${PROPOSER_ID}@3.0` });
      signerWith(executeTransaction);
      vi.mocked(fetchContractResult).mockResolvedValue(REGISTERED as never);
      vi.mocked(fetchTransaction).mockResolvedValue([
        { transaction_id: `${PROPOSER_ID}-3-0`, name: "SCHEDULECREATE", entity_id: "0.0.999" } as never,
      ]);

      const { result } = renderHook(() => useCreateProposal(), { wrapper: createQueryWrapper() });
      result.current.mutate({ executorContractId: EXECUTOR_CONTRACT_ID, proposal, memo: "test proposal" });
      await waitFor(() => expect(result.current.isError).toBe(true));

      const changed = { ...proposal, calldata: "0x5678" as const };
      result.current.mutate({ executorContractId: EXECUTOR_CONTRACT_ID, proposal: changed, memo: "test proposal" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      // createProposal, rejected schedule, then createProposal and schedule for the new call.
      expect(executeTransaction).toHaveBeenCalledTimes(4);
    });

    it("forgets a registration that reverted, since it left no entry to schedule", async () => {
      const executeTransaction = vi.fn().mockResolvedValueOnce({ transactionId: `${PROPOSER_ID}@1.0` });
      signerWith(executeTransaction);
      vi.mocked(fetchContractResult).mockResolvedValue({
        call_result: "0x",
        error_message: "CONTRACT_REVERT_EXECUTED",
      } as never);

      const { result } = renderHook(() => useCreateProposal(), { wrapper: createQueryWrapper() });
      result.current.mutate({ executorContractId: EXECUTOR_CONTRACT_ID, proposal, memo: "test proposal" });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.unscheduledEntry).toBeNull();
    });
  });
});
