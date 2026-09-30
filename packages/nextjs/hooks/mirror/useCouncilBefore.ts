"use client";

import { mirrorQueryKey } from "./mirrorQuery";
import { type CouncilKey, fetchCouncilKeyBefore } from "@sh/core/governance/council";
import { useQuery } from "@tanstack/react-query";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

export type CouncilBeforeInput = {
  governanceAccountId: string;
  /** When the change ran (the schedule's `executed_timestamp`); null reads nothing. */
  executedTimestamp: string | null;
  network: HederaNetworkName;
};

/** The council just before a change ran. History does not change, so it is read once and kept. */
export function useCouncilBefore({ governanceAccountId, executedTimestamp, network }: CouncilBeforeInput) {
  return useQuery<CouncilKey, Error>({
    queryKey: mirrorQueryKey(network, "councilBefore", governanceAccountId, executedTimestamp ?? ""),
    queryFn: () => fetchCouncilKeyBefore(governanceAccountId, executedTimestamp ?? "", network),
    enabled: executedTimestamp !== null,
    staleTime: Infinity,
    retry: false,
  });
}
