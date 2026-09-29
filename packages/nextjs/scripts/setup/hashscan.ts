import type { SetupNetwork } from "./env";

export type HashScanEntity = "account" | "token";

export function hashScanUrl(entity: HashScanEntity, id: string, network: SetupNetwork = "testnet"): string {
  return `https://hashscan.io/${network}/${entity}/${id}`;
}
