/**
 * The two Hedera networks this template supports, as a plain type.
 *
 * It lives here rather than next to the chain list in `scaffold.config.ts` because the domain only
 * ever uses it to pick a Mirror base URL or label a read: every relay URL arrives as a parameter.
 * Keeping the type free of the app's config is what lets the agent share this code.
 */
export type HederaNetworkName = "testnet" | "mainnet";

/** Narrows the free-form network name an env var carries, falling back to testnet like the Mirror client. */
export function toHederaNetworkName(network: string): HederaNetworkName {
  return network.toLowerCase() === "mainnet" ? "mainnet" : "testnet";
}
