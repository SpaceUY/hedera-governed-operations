import { fetchTreasuryFigures } from "./treasury";
import { ContractId } from "@hiero-ledger/sdk";
import { fetchAccount } from "@sh/core/mirror";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@sh/core/mirror", async importOriginal => ({
  ...(await importOriginal<typeof import("@sh/core/mirror")>()),
  fetchAccount: vi.fn(),
}));

const mockReadContract = vi.fn();
// The relay client, not viem: `@sh/core` resolves its own copy of viem, so a `vi.mock("viem")` here
// would replace the app's instance and leave the one the domain actually calls untouched — the read
// would go to the network. `createRelayClient` is the seam the app depends on either way.
vi.mock("@sh/core/relayClient", () => ({
  createRelayClient: () => ({ readContract: mockReadContract }),
}));

const GOVERNANCE_ACCOUNT_ID = "0.0.10671146";
const VAULT_CONTRACT_ID = "0.0.10671260";
const DEMO_TOKEN_ID = "0.0.10671333";
const USDC_TOKEN_ID = "0.0.5449";
const RPC_URL = "https://testnet.hashio.io/api";

describe("fetchTreasuryFigures", () => {
  afterEach(() => {
    vi.mocked(fetchAccount).mockReset();
    mockReadContract.mockReset();
  });

  it("combines the Mirror account balance with the vault's on-chain reserve", async () => {
    vi.mocked(fetchAccount).mockResolvedValue({
      balance: {
        balance: 123_00000000,
        timestamp: "0",
        tokens: [
          { token_id: DEMO_TOKEN_ID, balance: 42 },
          { token_id: USDC_TOKEN_ID, balance: 7 },
        ],
      },
    } as never);
    mockReadContract.mockResolvedValue(9_00000000n);

    expect(
      await fetchTreasuryFigures({
        governanceAccountId: GOVERNANCE_ACCOUNT_ID,
        vaultContractId: VAULT_CONTRACT_ID,
        demoTokenId: DEMO_TOKEN_ID,
        usdcTokenId: USDC_TOKEN_ID,
        rpcUrl: RPC_URL,
      }),
    ).toEqual({
      hbarBalanceTinybar: 123_00000000,
      demoTokenBalance: 42,
      usdcBalance: 7,
      vaultReserveTinybar: 9_00000000n,
    });
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: `0x${ContractId.fromString(VAULT_CONTRACT_ID).toEvmAddress()}` }),
    );
  });

  it("reports zero for a token the account never received", async () => {
    vi.mocked(fetchAccount).mockResolvedValue({
      balance: { balance: 0, timestamp: "0", tokens: [] },
    } as never);
    mockReadContract.mockResolvedValue(0n);

    const figures = await fetchTreasuryFigures({
      governanceAccountId: GOVERNANCE_ACCOUNT_ID,
      vaultContractId: VAULT_CONTRACT_ID,
      demoTokenId: DEMO_TOKEN_ID,
      usdcTokenId: USDC_TOKEN_ID,
      rpcUrl: RPC_URL,
    });
    expect(figures.demoTokenBalance).toBe(0);
    expect(figures.usdcBalance).toBe(0);
  });

  it("keeps a reserve above Number.MAX_SAFE_INTEGER exact", async () => {
    vi.mocked(fetchAccount).mockResolvedValue({
      balance: { balance: 0, timestamp: "0", tokens: [] },
    } as never);
    const reserve = 5_000_000_000_000_000_001n;
    mockReadContract.mockResolvedValue(reserve);

    const figures = await fetchTreasuryFigures({
      governanceAccountId: GOVERNANCE_ACCOUNT_ID,
      vaultContractId: VAULT_CONTRACT_ID,
      demoTokenId: DEMO_TOKEN_ID,
      usdcTokenId: USDC_TOKEN_ID,
      rpcUrl: RPC_URL,
    });
    expect(figures.vaultReserveTinybar).toBe(reserve);
  });
});
