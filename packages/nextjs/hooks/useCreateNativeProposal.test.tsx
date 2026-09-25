import { useCreateNativeProposal } from "./useCreateNativeProposal";
import { AccountId, Hbar, PrivateKey, TransferTransaction } from "@hiero-ledger/sdk";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "~~/hooks/mirror/testUtils";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { fetchTransaction } from "~~/services/mirror";

vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: vi.fn() }));
vi.mock("~~/services/mirror", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/services/mirror")>()),
  fetchTransaction: vi.fn(),
  fetchAccount: vi.fn(),
}));
vi.mock("~~/config/governanceConfig", () => ({
  getGovernanceEntityIds: () => ({ governanceAccountId: "0.0.10671146", demoTokenId: "0.0.1", seedProposalId: 1 }),
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

    const { fetchAccount } = await import("~~/services/mirror");
    vi.mocked(fetchAccount).mockResolvedValue({
      key: { _type: "ECDSA_SECP256K1", key: PrivateKey.generateECDSA().publicKey.toStringRaw() },
    } as never);
    vi.mocked(fetchTransaction).mockResolvedValue([
      { transaction_id: `${PROPOSER_ID}-1-0`, name: "SCHEDULECREATE", entity_id: "0.0.777" } as never,
    ]);

    const innerTransaction = new TransferTransaction()
      .addHbarTransfer(AccountId.fromString("0.0.10671146"), Hbar.fromTinybars(-4_000_000_000))
      .addHbarTransfer(AccountId.fromString("0.0.500"), Hbar.fromTinybars(4_000_000_000));

    const { result } = renderHook(() => useCreateNativeProposal(), { wrapper: createQueryWrapper() });
    result.current.mutate({ innerTransaction, memo: "pay supplier" });

    await waitFor(() => expect(result.current.data?.scheduleId).toBe("0.0.777"));
  });
});
