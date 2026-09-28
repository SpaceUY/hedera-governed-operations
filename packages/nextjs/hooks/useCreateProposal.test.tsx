import { useCreateProposal } from "./useCreateProposal";
import { PrivateKey } from "@hiero-ledger/sdk";
import { QueryClient } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "~~/hooks/mirror/testUtils";
import { proposalInboxQueryKey } from "~~/hooks/mirror/useProposals";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { MirrorNodeError, fetchContractResult, fetchTransaction } from "~~/services/mirror";

vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: vi.fn() }));
vi.mock("~~/services/mirror", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/services/mirror")>()),
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

    const { fetchAccount } = await import("~~/services/mirror");
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

    const { fetchAccount } = await import("~~/services/mirror");
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
});
