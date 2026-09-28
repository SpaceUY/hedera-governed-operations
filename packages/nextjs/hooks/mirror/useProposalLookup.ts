"use client";

import { useEffect, useRef } from "react";
import {
  DEFAULT_PENDING_POLL_MS,
  getDefaultMirrorNetwork,
  mirrorQueryKey,
  registryEntryQueryKey,
  resolvePendingRefetchInterval,
} from "./mirrorQuery";
import { type CouncilOptions, useCouncil } from "./useCouncil";
import { useRefreshOnSettle } from "./useRefreshOnSettle";
import { fetchScheduleQueryData } from "./useSchedule";
import { ContractId } from "@hiero-ledger/sdk";
import { countThresholdSignatures } from "@sh/core/governance/council";
import { decodeScheduledOperation } from "@sh/core/governance/decode";
import { type Proposal, unreadRegistry } from "@sh/core/governance/proposals";
import { type RegistryCrossCheck, fetchRegistryEntries } from "@sh/core/governance/registry";
import { deriveScheduleState, fetchSchedule } from "@sh/core/mirror";
import { hasFinalOutcome } from "@sh/core/mirror";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getHederaRpcUrl, toHederaNetworkName } from "~~/utils/scaffold-hbar/networks";

export type ProposalLookupOptions = CouncilOptions & { scheduleId: string };

/**
 * How long a cancel that was just sent keeps its entry reading "cancelled" while the relay still
 * answers "pending". The relay trails consensus by a block or two, so this is several times that;
 * past it, a relay still saying "pending" is believed — the cancel did not take.
 */
export const CANCEL_CONFIRMATION_WINDOW_MS = 30_000;

type SentCancel = { proposalId: number; sentAt: number };

/** Same comparison the inbox uses: a scheduled body can name a contract by id or by EVM address. */
function isThisExecutor(named: string, executorContractId: string): boolean {
  if (named === executorContractId) return true;
  return named.toLowerCase() === `0x${ContractId.fromString(executorContractId).toEvmAddress()}`.toLowerCase();
}

/**
 * One proposal, addressed directly by its schedule id — for a direct link or a schedule outside
 * `useProposals`' visible page window. Returns the exact same `Proposal` shape the inbox already
 * renders, computed the same way, for exactly one row instead of the whole list.
 *
 * A schedule the governance account does not pay for is not a proposal, whatever its body says: the
 * inbox filters those out, and so does this, returning an error instead of a `Proposal` so a crafted
 * link never reaches a Sign button.
 */
export function useProposalLookup({ scheduleId, ...options }: ProposalLookupOptions) {
  const network = options.network ?? getDefaultMirrorNetwork();
  const hederaNetwork = toHederaNetworkName(network);
  const council = useCouncil(options);
  const queryClient = useQueryClient();
  const delayedRefresh = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentCancel = useRef<SentCancel | null>(null);
  useEffect(
    () => () => {
      if (delayedRefresh.current) clearTimeout(delayedRefresh.current);
    },
    [],
  );
  const scheduleKey = mirrorQueryKey(network, "schedule", scheduleId);

  const scheduleQuery = useQuery({
    queryKey: scheduleKey,
    queryFn: () => fetchScheduleQueryData(scheduleId, network),
    retry: false,
    refetchInterval: query =>
      resolvePendingRefetchInterval(
        { isSettled: query.state.data && hasFinalOutcome(query.state.data), error: query.state.error },
        DEFAULT_PENDING_POLL_MS,
      ),
  });

  const isGovernancePayer = scheduleQuery.data?.schedule.payer_account_id === options.governanceAccountId;
  const operation =
    scheduleQuery.data && isGovernancePayer
      ? decodeScheduledOperation(scheduleQuery.data.schedule.transaction_body)
      : undefined;
  // The entry is read whatever state the schedule is in. Once it was deleted or expired, or ran and
  // failed, it is exactly when the proposer should cancel it or the council schedule it again; once
  // it ran, the entry is what says what ran. One page reads one entry, unlike the inbox, which skips
  // the ones whose schedule ran them (`notRead`) to spare a read per row and poll.
  const needsRegistryCheck =
    operation?.kind === "registryCall" && isThisExecutor(operation.executorContractId, options.executorContractId);
  const proposalId = operation?.kind === "registryCall" ? operation.proposalId : undefined;
  const registryKey = registryEntryQueryKey(network, options.executorContractId, proposalId);

  /**
   * A read taken while a cancel this page sent is unconfirmed. "Pending" inside the window is the
   * relay lagging, so the entry stays cancelled; any other answer, or "pending" once the window is
   * over, is the relay's final word and ends the wait.
   */
  const whileAwaitingCancel = (read: RegistryCrossCheck): RegistryCrossCheck => {
    const sent = sentCancel.current;
    if (!sent || sent.proposalId !== proposalId) return read;
    const withinWindow = Date.now() - sent.sentAt < CANCEL_CONFIRMATION_WINDOW_MS;
    if (read.status === "read" && read.entry.state === "pending" && withinWindow) {
      return { ...read, entry: { ...read.entry, state: "cancelled" } };
    }
    sentCancel.current = null;
    return read;
  };

  const registryQuery = useQuery({
    queryKey: registryKey,
    queryFn: async () => {
      const entries = await fetchRegistryEntries([proposalId!], {
        executorContractId: options.executorContractId,
        rpcUrl: getHederaRpcUrl(hederaNetwork),
      });
      const read =
        entries.get(proposalId!) ?? ({ status: "unreachable", reason: "not returned" } satisfies RegistryCrossCheck);
      return whileAwaitingCancel(read);
    },
    enabled: needsRegistryCheck,
    staleTime: DEFAULT_PENDING_POLL_MS,
    // Polls only while a cancel sent from this page is waiting for the relay to confirm it.
    refetchInterval: () =>
      proposalId !== undefined && sentCancel.current?.proposalId === proposalId ? DEFAULT_PENDING_POLL_MS : false,
  });

  const isLoading = scheduleQuery.isLoading || council.isLoading || (needsRegistryCheck && registryQuery.isLoading);
  const notGovernanceError =
    scheduleQuery.data && !isGovernancePayer
      ? new Error(
          `Schedule ${scheduleId} is paid by ${scheduleQuery.data.schedule.payer_account_id}, not by the governance ` +
            `account ${options.governanceAccountId}, so it is not a governance proposal.`,
        )
      : null;
  const error = scheduleQuery.error ?? notGovernanceError ?? council.error ?? registryQuery.error ?? null;

  const proposal: Proposal | undefined =
    scheduleQuery.data && council.data && operation && (!needsRegistryCheck || registryQuery.data)
      ? {
          schedule: scheduleQuery.data.schedule,
          state: scheduleQuery.data.state,
          execution: scheduleQuery.data.execution,
          operation,
          progress: countThresholdSignatures(scheduleQuery.data.schedule, council.data.key),
          incomingProgress:
            operation.kind === "councilRotation"
              ? countThresholdSignatures(scheduleQuery.data.schedule, operation.council)
              : null,
          registry: needsRegistryCheck ? registryQuery.data! : unreadRegistry(operation, options.executorContractId),
        }
      : undefined;
  useRefreshOnSettle(proposal ? [proposal] : undefined, {
    network,
    governanceAccountId: options.governanceAccountId,
    executorContractId: options.executorContractId,
  });

  /**
   * Re-reads the schedule and the registry entry after a write. Mirror and the relay both lag
   * consensus by seconds, so it reads once now and once more after a poll interval.
   */
  const refresh = () => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: scheduleKey });
      void queryClient.invalidateQueries({ queryKey: registryKey });
    };
    invalidate();
    if (delayedRefresh.current) clearTimeout(delayedRefresh.current);
    delayedRefresh.current = setTimeout(invalidate, DEFAULT_PENDING_POLL_MS);
  };

  /**
   * After `cancel` is sent. A signer returns once the transaction is submitted — HashPack without a
   * receipt — and the relay serves state a block or two behind, so neither an immediate re-read nor
   * the submission alone settles it. The entry reads "cancelled" straight away and is polled until
   * the relay agrees, or until `CANCEL_CONFIRMATION_WINDOW_MS` passes with it still pending, in
   * which case the cancel did not take and the entry reads pending again.
   */
  const markRegistryEntryCancelled = () => {
    if (proposalId === undefined) return;
    sentCancel.current = { proposalId, sentAt: Date.now() };
    queryClient.setQueryData<RegistryCrossCheck>(registryKey, current =>
      current?.status === "read" ? { ...current, entry: { ...current.entry, state: "cancelled" } } : current,
    );
  };

  return { proposal, isLoading, error, refresh, markRegistryEntryCancelled };
}
