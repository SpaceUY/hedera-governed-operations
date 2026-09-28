import { useCreateNativeProposal } from "./useCreateNativeProposal";
import { AccountId, Hbar, PrivateKey, TransferTransaction } from "@hiero-ledger/sdk";
import { MirrorNodeError, fetchTransaction } from "@sh/core/mirror";
import { QueryClient } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "~~/hooks/mirror/testUtils";
import { proposalInboxQueryKey } from "~~/hooks/mirror/useProposals";
import { useHederaSigner } from "~~/hooks/useHederaSigner";

vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: vi.fn() }));
vi.mock("@sh/core/mirror", async importOriginal => ({
  ...(await importOriginal<typeof import("@sh/core/mirror")>()),
  fetchTransaction: vi.fn(),
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

const PROPOSER_ID = "0.0.10671147";

afterEach(() => {
  cleanup();
  vi.mocked(fetchTransaction).mockReset();
});

describe("useCreateNativeProposal", () => {
  it("schedules the given native transaction and returns the schedule id", async () => {
    const executeTransaction = vi.fn().mockResolvedValue({ transactionId: `${PROPOSER_ID}@1.0` });
    vi.mocked(useHederaSigner).mockReturnValue({ executeTransaction, requireAccountId: () => PROPOSER_ID } as never);

    const { fetchAccount } = await import("@sh/core/mirror");
    vi.mocked(fetchAccount).mockResolvedValue({
      key: { _type: "ECDSA_SECP256K1", key: PrivateKey.generateECDSA().publicKey.toStringRaw() },
    } as never);
    // Mirror has not indexed the ScheduleCreate on the first read.
    vi.mocked(fetchTransaction)
      .mockRejectedValueOnce(new MirrorNodeError(404, "url", "not found"))
      .mockResolvedValue([
        { transaction_id: `${PROPOSER_ID}-1-0`, name: "SCHEDULECREATE", entity_id: "0.0.777" } as never,
      ]);

    const innerTransaction = new TransferTransaction()
      .addHbarTransfer(AccountId.fromString("0.0.10671146"), Hbar.fromTinybars(-4_000_000_000))
      .addHbarTransfer(AccountId.fromString("0.0.500"), Hbar.fromTinybars(4_000_000_000));

    const { result } = renderHook(() => useCreateNativeProposal(), { wrapper: createQueryWrapper() });
    result.current.mutate({ innerTransaction, memo: "pay supplier" });

    await waitFor(() => expect(result.current.data?.scheduleId).toBe("0.0.777"));
    expect(fetchTransaction).toHaveBeenCalledTimes(2);
  });

  it("gives up after polling with an error naming the transaction", async () => {
    const executeTransaction = vi.fn().mockResolvedValue({ transactionId: `${PROPOSER_ID}@1.0` });
    vi.mocked(useHederaSigner).mockReturnValue({ executeTransaction, requireAccountId: () => PROPOSER_ID } as never);

    const { fetchAccount } = await import("@sh/core/mirror");
    vi.mocked(fetchAccount).mockResolvedValue({
      key: { _type: "ECDSA_SECP256K1", key: PrivateKey.generateECDSA().publicKey.toStringRaw() },
    } as never);
    vi.mocked(fetchTransaction).mockRejectedValue(new MirrorNodeError(404, "url", "not found"));

    const innerTransaction = new TransferTransaction()
      .addHbarTransfer(AccountId.fromString("0.0.10671146"), Hbar.fromTinybars(-1))
      .addHbarTransfer(AccountId.fromString("0.0.500"), Hbar.fromTinybars(1));

    const { result } = renderHook(() => useCreateNativeProposal(), { wrapper: createQueryWrapper() });
    result.current.mutate({ innerTransaction, memo: "pay supplier" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain(`${PROPOSER_ID}@1.0`);
    expect(executeTransaction).toHaveBeenCalledTimes(1);
  });

  it("refreshes every inbox on the network once the schedule is indexed, and nothing else", async () => {
    const executeTransaction = vi.fn().mockResolvedValue({ transactionId: `${PROPOSER_ID}@1.0` });
    vi.mocked(useHederaSigner).mockReturnValue({ executeTransaction, requireAccountId: () => PROPOSER_ID } as never);
    const { fetchAccount } = await import("@sh/core/mirror");
    vi.mocked(fetchAccount).mockResolvedValue({
      key: { _type: "ECDSA_SECP256K1", key: PrivateKey.generateECDSA().publicKey.toStringRaw() },
    } as never);
    vi.mocked(fetchTransaction).mockResolvedValue([
      { transaction_id: `${PROPOSER_ID}-1-0`, name: "SCHEDULECREATE", entity_id: "0.0.777" } as never,
    ]);

    const queryClient = new QueryClient();
    const inboxKey = [...proposalInboxQueryKey("testnet"), "0.0.10671146", "0.0.4242"];
    const otherKey = ["mirror", "testnet", "account", "0.0.500"];
    queryClient.setQueryData(inboxKey, "inbox");
    queryClient.setQueryData(otherKey, "account");

    const innerTransaction = new TransferTransaction()
      .addHbarTransfer(AccountId.fromString("0.0.10671146"), Hbar.fromTinybars(-1))
      .addHbarTransfer(AccountId.fromString("0.0.500"), Hbar.fromTinybars(1));
    const { result } = renderHook(() => useCreateNativeProposal(), { wrapper: createQueryWrapper(queryClient) });
    result.current.mutate({ innerTransaction, memo: "pay supplier" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(inboxKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherKey)?.isInvalidated).toBe(false);
  });
});
