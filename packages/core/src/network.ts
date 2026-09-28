/**
 * The two Hedera networks this template supports, as a plain type.
 *
 * It lives here rather than next to the chain list in `scaffold.config.ts` because the domain only
 * ever uses it to pick a Mirror base URL or label a read: every relay URL arrives as a parameter.
 * Keeping the type free of the app's config is what lets the agent share this code.
 */
export type HederaNetworkName = "testnet" | "mainnet";

/**
 * Narrows the network name the app carries, falling back to testnet like the Mirror client.
 *
 * The app's name comes from the connected chain, where anything unrecognised is a chain the user
 * switched to and testnet is the safe reading. A name typed into an environment file is a different
 * thing and wants `parseHederaNetworkName`, which refuses it.
 */
export function toHederaNetworkName(network: string): HederaNetworkName {
  return network.toLowerCase() === "mainnet" ? "mainnet" : "testnet";
}

/**
 * The same narrowing for a value somebody wrote down, which is why it throws instead of falling
 * back: `HEDERA_NETWORK=mainet` silently answering "testnet" is a process signing on one network
 * with the key it was handed for another.
 */
export function parseHederaNetworkName(network: string, label: string): HederaNetworkName {
  const name = network.trim().toLowerCase();
  if (name === "testnet" || name === "mainnet") return name;
  throw new Error(`${label} must be testnet or mainnet, got ${JSON.stringify(network)}`);
}
