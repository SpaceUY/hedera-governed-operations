"use client";

import {
  DEFAULT_PENDING_POLL_MS,
  type MirrorQueryOptions,
  getDefaultMirrorNetwork,
  mirrorQueryKey,
} from "./mirrorQuery";
import { useQuery } from "@tanstack/react-query";
import { fetchTreasuryFigures } from "~~/services/governance/treasury";
import { getHederaRpcUrl, toHederaNetworkName } from "~~/utils/scaffold-hbar/networks";

export type TreasuryFiguresOptions = MirrorQueryOptions & {
  governanceAccountId: string;
  vaultContractId: string;
  demoTokenId: string;
  usdcTokenId: string;
};

export function useTreasuryFigures({
  governanceAccountId,
  vaultContractId,
  demoTokenId,
  usdcTokenId,
  ...options
}: TreasuryFiguresOptions) {
  const network = options.network ?? getDefaultMirrorNetwork();
  const hederaNetwork = toHederaNetworkName(network);

  return useQuery({
    queryKey: mirrorQueryKey(
      network,
      "treasury-figures",
      governanceAccountId,
      vaultContractId,
      demoTokenId,
      usdcTokenId,
    ),
    queryFn: () =>
      fetchTreasuryFigures({
        governanceAccountId,
        vaultContractId,
        demoTokenId,
        usdcTokenId,
        rpcUrl: getHederaRpcUrl(hederaNetwork),
        network,
      }),
    enabled: (options.enabled ?? true) && governanceAccountId.length > 0 && vaultContractId.length > 0,
    staleTime: DEFAULT_PENDING_POLL_MS,
  });
}
