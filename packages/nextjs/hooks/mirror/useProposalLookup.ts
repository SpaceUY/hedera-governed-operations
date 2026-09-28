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
  // the settled ones (`notRead`) to spare a read per row and poll.
  const needsRegistryCheck =
    operation?.kind === "registryCall" && isThisExecutor(operation.executorContractId, options.executorContractId);
  const proposalId = operation?.kind === "registryCall" ? operation.proposalId : undefined;
  const registryKey = registryEntryQueryKey(network, options.executorContractId, proposalId);

  const registryQuery = useQuery({
    queryKey: registryKey,
    queryFn: async () => {
      const entries = await fetchRegistryEntries([proposalId!], {
        executorContractId: options.executorContractId,
        rpcUrl: getHederaRpcUrl(hederaNetwork),
      });
      return (
        entries.get(proposalId!) ?? ({ status: "unreachable", reason: "not returned" } satisfies RegistryCrossCheck)
      );
    },
    enabled: needsRegistryCheck,
    staleTime: DEFAULT_PENDING_POLL_MS,
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

  return { proposal, isLoading, error, refresh };
}
