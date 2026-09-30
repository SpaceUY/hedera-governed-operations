import { IMPLEMENTATION_SLOT, fetchVaultImplementation } from "./vaultImplementation";
import { ContractId } from "@hiero-ledger/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockGetStorageAt = vi.fn();
// The relay client is the seam, as for the treasury read: `@sh/core` resolves its own copy of viem.
vi.mock("@sh/core/relayClient", () => ({ createRelayClient: () => ({ getStorageAt: mockGetStorageAt }) }));

const VAULT_CONTRACT_ID = "0.0.10671260";
const OPTIONS = { vaultContractId: VAULT_CONTRACT_ID, rpcUrl: "https://testnet.hashio.io/api" };

describe("fetchVaultImplementation", () => {
  afterEach(() => mockGetStorageAt.mockReset());

  it("reads the implementation address from the proxy's ERC-1967 slot", async () => {
    mockGetStorageAt.mockResolvedValue("0x000000000000000000000000b87228be9d802953d9e657f97b827786b22e7305");
    expect(await fetchVaultImplementation(OPTIONS)).toBe("0xb87228Be9d802953d9e657f97b827786b22e7305");
    expect(mockGetStorageAt).toHaveBeenCalledWith({
      address: `0x${ContractId.fromString(VAULT_CONTRACT_ID).toEvmAddress()}`,
      slot: IMPLEMENTATION_SLOT,
    });
  });

  it.each([undefined, "0x", "0x1234", "not hex"])("answers null for a slot the relay returned as %s", async slot => {
    mockGetStorageAt.mockResolvedValue(slot);
    expect(await fetchVaultImplementation(OPTIONS)).toBeNull();
  });

  it("lets a failed read fail, so the query reports it", async () => {
    mockGetStorageAt.mockRejectedValue(new Error("relay down"));
    await expect(fetchVaultImplementation(OPTIONS)).rejects.toThrow("relay down");
  });
});
