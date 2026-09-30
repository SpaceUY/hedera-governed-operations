import { ContractId } from "@hiero-ledger/sdk";
import { createRelayClient } from "@sh/core/relayClient";
import { type Address, getAddress, isHex, size, sliceHex } from "viem";

/** Where an ERC-1967 proxy such as the vault keeps the address of the code it runs. */
export const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

/**
 * The code the vault's proxy runs now, read from its ERC-1967 slot through the JSON-RPC relay. Null
 * when the relay answers with anything but one 32-byte word, which no proxy slot is.
 */
export async function fetchVaultImplementation({
  vaultContractId,
  rpcUrl,
}: {
  vaultContractId: string;
  rpcUrl: string;
}): Promise<Address | null> {
  const slot = await createRelayClient(rpcUrl).getStorageAt({
    address: `0x${ContractId.fromString(vaultContractId).toEvmAddress()}`,
    slot: IMPLEMENTATION_SLOT,
  });
  if (!slot || !isHex(slot) || size(slot) !== 32) return null;
  return getAddress(sliceHex(slot, 12));
}
