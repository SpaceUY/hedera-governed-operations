/**
 * Hedera's EVM chain ids, and the network name Mirror Node and HashScan use for each. The deploy
 * scripts, the contract-id lookup and the verification script all branch on these.
 *
 * `packages/nextjs/scripts/setup/deployments.ts` needs the testnet id too and keeps its own copy:
 * it is in the other workspace and cannot import from here.
 */
export const HEDERA_MAINNET_CHAIN_ID = 295;
export const HEDERA_TESTNET_CHAIN_ID = 296;

export const HEDERA_NETWORK_BY_CHAIN_ID: Record<number, string> = {
  [HEDERA_MAINNET_CHAIN_ID]: "mainnet",
  [HEDERA_TESTNET_CHAIN_ID]: "testnet",
};

/** False on a local chain, where there is no Mirror Node and no native contract id to resolve. */
export const isHederaChainId = (chainId: number): boolean => chainId in HEDERA_NETWORK_BY_CHAIN_ID;
