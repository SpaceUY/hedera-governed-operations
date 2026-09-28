import type { HederaNetworkName } from "@sh/core/network";
import * as chains from "viem/chains";
import scaffoldConfig from "~~/scaffold.config";

export { getBlockExplorerAddressLink, getBlockExplorerTxLink } from "@scaffold-hbar-ui/hooks";
/** The network name and its narrowing live in `@sh/core`, which the agent shares and this config does not. */
export { type HederaNetworkName, toHederaNetworkName } from "@sh/core/network";

type ChainAttributes = {
  // color | [lightThemeColor, darkThemeColor]
  color: string | [string, string];
  // Used to fetch price by providing mainnet token address
  // for networks having native currency other than ETH
  nativeCurrencyTokenAddress?: string;
};

export type ChainWithAttributes = chains.Chain & Partial<ChainAttributes>;
export type AllowedChainIds = (typeof scaffoldConfig.targetNetworks)[number]["id"];

export const NETWORKS_EXTRA_DATA: Record<string, ChainAttributes> = {
  [chains.mainnet.id]: {
    color: "#ff8b9e",
  },
  [chains.hedera.id]: {
    color: "#8259EF",
  },
  [chains.hederaTestnet.id]: {
    color: ["#8259EF", "#A98AFF"],
  },
};

/**
 * @returns targetNetworks array containing networks configured in scaffold.config including extra network metadata
 */
export function getTargetNetworks(): ChainWithAttributes[] {
  return scaffoldConfig.targetNetworks.map(targetNetwork => ({
    ...targetNetwork,
    ...NETWORKS_EXTRA_DATA[targetNetwork.id],
  }));
}

export function getHederaNetworkNameFromChainId(chainId: number): HederaNetworkName {
  if (chainId === chains.hedera.id) return "mainnet";
  if (chainId === chains.hederaTestnet.id) return "testnet";
  throw new Error(`Unsupported Hedera chain ID: ${chainId}`);
}

const HEDERA_CHAIN_ID = {
  testnet: chains.hederaTestnet.id,
  mainnet: chains.hedera.id,
} as const satisfies Record<HederaNetworkName, number>;

/** JSON-RPC relay endpoint, for reading a contract without an operator key. Overridden from env in `scaffold.config.ts`. */
export function getHederaRpcUrl(network: HederaNetworkName): string {
  return scaffoldConfig.rpcOverrides[HEDERA_CHAIN_ID[network]];
}
