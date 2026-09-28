"use client";

import { DEFAULT_PENDING_POLL_MS, getDefaultMirrorNetwork, mirrorQueryKey } from "./mirrorQuery";
import { type CouncilOptions, useCouncil } from "./useCouncil";
import { useRefreshOnSettle } from "./useRefreshOnSettle";
import { useQuery } from "@tanstack/react-query";
import { type ProposalInbox, fetchProposalInbox } from "~~/services/governance/proposals";
import { getHederaRpcUrl, toHederaNetworkName } from "~~/utils/scaffold-hbar/networks";

/**
 * How often the inbox is re-read once every proposal has settled. Unlike a single schedule, a list
 * can never stop polling — a proposal someone else opens has to show up — so it slows down instead.
 */
export const SETTLED_INBOX_POLL_MS = 30_000;

/** The prefix of every inbox on a network, whatever its council: what opening a proposal refreshes. */
export function proposalInboxQueryKey(network: string): string[] {
  return mirrorQueryKey(network, "proposals");
}

export type ProposalsOptions = CouncilOptions & {
  /** Interval while any proposal is still collecting signatures. */
  pollIntervalMs?: number;
};

/**
 * The council's open proposals, with each one's progress toward the threshold.
 *
 * The council is a query of its own so that polling the list does not re-read a composition that
 * only a passed proposal can change; this hook waits for it, since without the member keys there is
 * no way to tell an approval from the payer's signature.
 */
export function useProposals({ pollIntervalMs = DEFAULT_PENDING_POLL_MS, ...options }: ProposalsOptions) {
  const { governanceAccountId } = options;
  const network = options.network ?? getDefaultMirrorNetwork();
  const council = useCouncil(options);

  const inbox = useQuery<ProposalInbox, Error>({
    // The executor belongs in the key: the inbox is crossed against its registry, so pointing the app
    // at a different one has to invalidate the list and not just the council.
    queryKey: [
      ...proposalInboxQueryKey(network),
      governanceAccountId,
      options.executorContractId,
      ...(council.data?.proposerAccountIds ?? []),
    ],
    queryFn: () => {
      if (!council.data) throw new Error("The council has to be known before its proposals can be listed");
      const hederaNetwork = toHederaNetworkName(network);
      return fetchProposalInbox({
        proposerAccountIds: council.data.proposerAccountIds,
        unresolvableProposers: council.data.unresolvableProposers,
        governanceAccountId,
        council: council.data.key,
        network: hederaNetwork,
        registry: { executorContractId: options.executorContractId, rpcUrl: getHederaRpcUrl(hederaNetwork) },
      });
    },
    enabled: (options.enabled ?? true) && council.data !== undefined,
    retry: false,
    refetchInterval: query =>
      query.state.data?.proposals.some(proposal => !proposal.state.isSettled) ? pollIntervalMs : SETTLED_INBOX_POLL_MS,
  });
  useRefreshOnSettle(inbox.data?.proposals, {
    network,
    governanceAccountId,
    executorContractId: options.executorContractId,
  });

  return { inbox, council };
}
