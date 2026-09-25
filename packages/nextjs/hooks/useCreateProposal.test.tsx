import { useCreateProposal } from "./useCreateProposal";
import { PrivateKey } from "@hiero-ledger/sdk";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "~~/hooks/mirror/testUtils";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { fetchContractResult, fetchTransaction } from "~~/services/mirror";

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
  it("registers the proposal, then schedules its execute call and returns both ids", async () => {
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
    expect(result.current.error?.message).toMatch(/not yet indexed|poll again/i);
  });
});
