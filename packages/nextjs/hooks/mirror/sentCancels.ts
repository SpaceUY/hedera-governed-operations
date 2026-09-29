"use client";

import { mirrorQueryKey } from "./mirrorQuery";
import type { ProposalInbox } from "@sh/core/governance/proposals";
import type { RegistryCrossCheck } from "@sh/core/governance/registry";
import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * How long a cancel that was just sent keeps its entry reading "cancelled" while the relay still
 * answers "pending". The relay trails consensus by a block or two, so this is several times that;
 * past it, a relay still saying "pending" is believed — the cancel did not take.
 */
export const CANCEL_CONFIRMATION_WINDOW_MS = 30_000;

/** Registry entry id → when this browser sent its cancel, for the cancels the relay has not confirmed. */
export type SentCancels = Readonly<Record<number, number>>;

/**
 * Where the unconfirmed cancels live: in the query cache rather than in one hook's ref, so the detail
 * that sent a cancel and the inbox that lists the same entry read it the same way. Outside the inbox's
 * key prefix on purpose, so nothing that finds or invalidates the inboxes touches it.
 */
export function sentCancelsQueryKey(network: string, executorContractId: string): string[] {
  return mirrorQueryKey(network, "sent-cancels", executorContractId);
}

export function readSentCancels(queryClient: QueryClient, queryKey: string[]): SentCancels {
  return queryClient.getQueryData<SentCancels>(queryKey) ?? {};
}

export function recordSentCancel(
  queryClient: QueryClient,
  queryKey: string[],
  cancel: { proposalId: number; sentAt: number },
) {
  queryClient.setQueryData<SentCancels>(queryKey, current => ({ ...current, [cancel.proposalId]: cancel.sentAt }));
}

export function forgetSentCancel(queryClient: QueryClient, queryKey: string[], proposalId: number) {
  queryClient.setQueryData<SentCancels>(queryKey, current => {
    const remaining = { ...current };
    delete remaining[proposalId];
    return remaining;
  });
}

/**
 * The unconfirmed cancels, subscribed to, so a screen re-renders the moment one is sent. Never
 * fetched: the query only holds what `recordSentCancel` wrote, and a refetch hands that back as it is.
 */
export function useSentCancels(network: string, executorContractId: string): SentCancels {
  const queryClient = useQueryClient();
  const queryKey = sentCancelsQueryKey(network, executorContractId);
  const { data } = useQuery({
    queryKey,
    queryFn: () => readSentCancels(queryClient, queryKey),
    initialData: {},
    staleTime: Infinity,
  });
  return data;
}

/**
 * A registry read taken while a cancel sent at `sentAt` is unconfirmed. "Pending" inside the window is
 * the relay lagging, so the entry reads cancelled; any other answer, or "pending" once the window is
 * over, is returned as it came.
 */
export function readWhileAwaitingCancel(read: RegistryCrossCheck, sentAt: number | undefined, now: number) {
  if (sentAt === undefined || now - sentAt >= CANCEL_CONFIRMATION_WINDOW_MS) return read;
  if (read.status !== "read" || read.entry.state !== "pending") return read;
  return { ...read, entry: { ...read.entry, state: "cancelled" } } satisfies RegistryCrossCheck;
}

/**
 * The inbox as a screen shows it: each entry with an unconfirmed cancel read the way the detail reads
 * it. Applied on the way out of the cache, never into it — the inbox reuses an entry it once read as
 * cancelled for good (`previous`), which would outlive a cancel that did not take.
 */
export function inboxWhileAwaitingCancels(inbox: ProposalInbox, sentCancels: SentCancels, now: number): ProposalInbox {
  if (Object.keys(sentCancels).length === 0) return inbox;
  return {
    ...inbox,
    proposals: inbox.proposals.map(proposal =>
      proposal.registry.status === "read"
        ? {
            ...proposal,
            registry: readWhileAwaitingCancel(proposal.registry, sentCancels[proposal.registry.entry.proposalId], now),
          }
        : proposal,
    ),
  };
}
