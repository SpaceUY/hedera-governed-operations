"use client";

import {
  DEFAULT_PENDING_POLL_MS,
  type MirrorQueryOptions,
  getDefaultMirrorNetwork,
  mirrorQueryKey,
} from "./mirrorQuery";
import { useQuery } from "@tanstack/react-query";
import { fetchVaultImplementation } from "~~/services/governance/vaultImplementation";
import { getHederaRpcUrl, toHederaNetworkName } from "~~/utils/scaffold-hbar/networks";

/** With only the network, the prefix of every vault-implementation query on it. */
export function vaultImplementationQueryKey(network: string, ...vaultContractIds: string[]): string[] {
  return mirrorQueryKey(network, "vault-implementation", ...vaultContractIds);
}

/**
 * The code the vault's proxy runs. Not polled: only an approved upgrade changes it, and a settled
 * proposal re-reads it (`useRefreshOnSettle`).
 */
export function useVaultImplementation(
  vaultContractId: string,
  options: Omit<MirrorQueryOptions, "pollIntervalMs"> = {},
) {
  const network = options.network ?? getDefaultMirrorNetwork();
  return useQuery({
    queryKey: vaultImplementationQueryKey(network, vaultContractId),
    queryFn: () => fetchVaultImplementation({ vaultContractId, rpcUrl: getHederaRpcUrl(toHederaNetworkName(network)) }),
    enabled: (options.enabled ?? true) && vaultContractId.length > 0,
    staleTime: DEFAULT_PENDING_POLL_MS,
  });
}
