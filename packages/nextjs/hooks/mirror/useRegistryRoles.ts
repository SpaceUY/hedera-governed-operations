"use client";

import { type MirrorQueryOptions, getDefaultMirrorNetwork, mirrorQueryKey } from "./mirrorQuery";
import { COUNCIL_STALE_MS } from "./useCouncil";
import { type RegistryRoles, fetchRegistryRoles } from "@sh/core/governance/roles";
import { useQuery } from "@tanstack/react-query";
import { getHederaRpcUrl, toHederaNetworkName } from "~~/utils/scaffold-hbar/networks";

export type RegistryRolesOptions = MirrorQueryOptions & { executorContractId: string };

export function registryRolesQueryKey(network: string, executorContractId: string): string[] {
  return mirrorQueryKey(network, "registryRoles", executorContractId);
}

/**
 * Who may run proposals and who administers the roles, read from the executor through the relay.
 * Cached like the council: only an approved proposal changes either.
 */
export function useRegistryRoles({ executorContractId, ...options }: RegistryRolesOptions) {
  const network = options.network ?? getDefaultMirrorNetwork();
  const hederaNetwork = toHederaNetworkName(network);

  return useQuery<RegistryRoles, Error>({
    queryKey: registryRolesQueryKey(network, executorContractId),
    queryFn: () => fetchRegistryRoles({ executorContractId, rpcUrl: getHederaRpcUrl(hederaNetwork) }),
    enabled: (options.enabled ?? true) && executorContractId.length > 0,
    staleTime: COUNCIL_STALE_MS,
    retry: false,
  });
}
