"use client";

import { type MirrorQueryOptions, getDefaultMirrorNetwork, mirrorQueryKey } from "./mirrorQuery";
import { useQuery } from "@tanstack/react-query";
import {
  type CouncilKey,
  type Proposer,
  fetchCouncilKey,
  fetchProposerAccountIds,
} from "~~/services/governance/council";
import { getHederaRpcUrl, toHederaNetworkName } from "~~/utils/scaffold-hbar/networks";

/**
 * How long the council is trusted without re-reading it. Its composition only changes through a
 * proposal that has already cleared the threshold, so this is cheap to hold and expensive to poll.
 */
export const COUNCIL_STALE_MS = 60_000;

export type CouncilQueryData = {
  key: CouncilKey;
  /** Whose schedules make up the inbox, since Mirror can only list schedules by their creator. */
  proposerAccountIds: string[];
  /** The same proposers with their keys, so one who holds a seat is recognised as that member. */
  proposers: Proposer[];
  /** Role holders that resolved to no account, so the inbox can say it is missing their proposals. */
  unresolvableProposers: string[];
};

export type CouncilOptions = MirrorQueryOptions & {
  governanceAccountId: string;
  executorContractId: string;
};

/** Who approves and who may propose, read from the ledger rather than from configuration. */
export function useCouncil({ governanceAccountId, executorContractId, ...options }: CouncilOptions) {
  const network = options.network ?? getDefaultMirrorNetwork();
  const hederaNetwork = toHederaNetworkName(network);

  return useQuery<CouncilQueryData, Error>({
    queryKey: mirrorQueryKey(network, "council", governanceAccountId, executorContractId),
    queryFn: async () => {
      const [key, proposers] = await Promise.all([
        fetchCouncilKey(governanceAccountId, hederaNetwork),
        fetchProposerAccountIds({
          executorContractId,
          network: hederaNetwork,
          rpcUrl: getHederaRpcUrl(hederaNetwork),
        }),
      ]);
      return {
        key,
        proposerAccountIds: proposers.accountIds,
        proposers: proposers.proposers,
        unresolvableProposers: proposers.unresolvable,
      };
    },
    enabled: (options.enabled ?? true) && governanceAccountId.length > 0 && executorContractId.length > 0,
    staleTime: COUNCIL_STALE_MS,
    retry: false,
  });
}
