"use client";

import {
  DEFAULT_PENDING_POLL_MS,
  getDefaultMirrorNetwork,
  mirrorQueryKey,
  resolvePendingRefetchInterval,
} from "./mirrorQuery";
import { type CouncilOptions, useCouncil } from "./useCouncil";
import { ContractId } from "@hiero-ledger/sdk";
import { useQuery } from "@tanstack/react-query";
import { countThresholdSignatures } from "~~/services/governance/council";
import { decodeScheduledOperation } from "~~/services/governance/decode";
import type { Proposal } from "~~/services/governance/proposals";
import { type RegistryCrossCheck, fetchRegistryEntries } from "~~/services/governance/registry";
import { deriveScheduleState, fetchSchedule } from "~~/services/mirror";
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
 */
export function useProposalLookup({ scheduleId, ...options }: ProposalLookupOptions) {
  const network = options.network ?? getDefaultMirrorNetwork();
  const hederaNetwork = toHederaNetworkName(network);
  const council = useCouncil(options);

  const scheduleQuery = useQuery({
    queryKey: mirrorQueryKey(network, "schedule", scheduleId),
    queryFn: async () => {
      const schedule = await fetchSchedule(scheduleId, { network });
      return { schedule, state: deriveScheduleState(schedule) };
    },
    retry: false,
    refetchInterval: query =>
      resolvePendingRefetchInterval(
        { isSettled: query.state.data?.state.isSettled, error: query.state.error },
        DEFAULT_PENDING_POLL_MS,
      ),
  });

  const operation = scheduleQuery.data
    ? decodeScheduledOperation(scheduleQuery.data.schedule.transaction_body)
    : undefined;
  const needsRegistryCheck =
    operation?.kind === "registryCall" &&
    !scheduleQuery.data!.state.isSettled &&
    isThisExecutor(operation.executorContractId, options.executorContractId);
  const proposalId = operation?.kind === "registryCall" ? operation.proposalId : undefined;

  const registryQuery = useQuery({
    queryKey: mirrorQueryKey(network, "registry-entry", String(proposalId ?? "")),
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
  const error = scheduleQuery.error ?? council.error ?? registryQuery.error ?? null;

  const proposal: Proposal | undefined =
    scheduleQuery.data && council.data && operation && (!needsRegistryCheck || registryQuery.data)
      ? {
          schedule: scheduleQuery.data.schedule,
          state: scheduleQuery.data.state,
          operation,
          progress: countThresholdSignatures(scheduleQuery.data.schedule, council.data.key),
          incomingProgress:
            operation.kind === "councilRotation"
              ? countThresholdSignatures(scheduleQuery.data.schedule, operation.council)
              : null,
          registry: needsRegistryCheck ? registryQuery.data! : { status: "notApplicable" },
        }
      : undefined;

  return { proposal, isLoading, error };
}
