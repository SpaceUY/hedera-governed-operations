"use client";

import { DEFAULT_PENDING_POLL_MS, getDefaultMirrorNetwork, mirrorQueryKey } from "./mirrorQuery";
import { inboxWhileAwaitingCancels, useSentCancels } from "./sentCancels";
import { type CouncilOptions, useCouncil } from "./useCouncil";
import { useRefreshOnSettle } from "./useRefreshOnSettle";
import { type ProposalInbox, fetchProposalInbox } from "@sh/core/governance/proposals";
import { hasFinalOutcome } from "@sh/core/mirror";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
  const sentCancels = useSentCancels(network, options.executorContractId);
  // The executor belongs in the key: the inbox is crossed against its registry, so pointing the app
  // at a different one has to invalidate the list and not just the council.
  const queryKey = [
    ...proposalInboxQueryKey(network),
    governanceAccountId,
    options.executorContractId,
    ...(council.data?.proposerAccountIds ?? []),
  ];

  const inbox = useQuery<ProposalInbox, Error>({
    queryKey,
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
        // Reads the cache for the key this call is about to write. Safe because React Query keeps
        // the previous data available under the same key while a refetch is in flight.
        previous: queryClient.getQueryData<ProposalInbox>(queryKey),
      });
    },
    enabled: (options.enabled ?? true) && council.data !== undefined,
    retry: false,
    refetchInterval: query =>
      query.state.data?.proposals.some(proposal => !hasFinalOutcome(proposal)) ? pollIntervalMs : SETTLED_INBOX_POLL_MS,
    // A cancel sent from the detail reads as it does there, rather than as the lagging relay answers.
    select: data => inboxWhileAwaitingCancels(data, sentCancels, Date.now()),
  });
  useRefreshOnSettle(inbox.data?.proposals, {
    network,
    governanceAccountId,
    executorContractId: options.executorContractId,
  });

  return { inbox, council };
}
