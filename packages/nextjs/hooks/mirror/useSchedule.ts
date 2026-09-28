"use client";

import {
  DEFAULT_PENDING_POLL_MS,
  type MirrorQueryOptions,
  getDefaultMirrorNetwork,
  mirrorQueryKey,
  resolvePendingRefetchInterval,
} from "./mirrorQuery";
import { useQuery } from "@tanstack/react-query";
import {
  type MirrorSchedule,
  type ScheduleExecution,
  type ScheduleState,
  deriveScheduleState,
  fetchSchedule,
  fetchScheduleExecution,
  hasFinalOutcome,
  isValidEntityId,
} from "~~/services/mirror";

export type ScheduleQueryData = {
  schedule: MirrorSchedule;
  state: ScheduleState;
  execution: ScheduleExecution;
};

/**
 * The one reading behind the schedule query key, shared with `useProposalLookup` so the two hooks
 * never put different shapes under the same key.
 */
export async function fetchScheduleQueryData(scheduleId: string, network: string): Promise<ScheduleQueryData> {
  const schedule = await fetchSchedule(scheduleId, { network });
  const execution = await fetchScheduleExecution(schedule, { network });
  return { schedule, state: deriveScheduleState(schedule), execution };
}

/**
 * Reads a schedule from Mirror, derives its state and, once it ran, whether it succeeded.
 * Polls while pending (or not yet indexed) and stops once deleted, expired, or executed with a known outcome.
 */
export function useSchedule(scheduleId: string | null | undefined, options: MirrorQueryOptions = {}) {
  const network = options.network ?? getDefaultMirrorNetwork();
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_PENDING_POLL_MS;
  const id = scheduleId?.trim() ?? "";

  return useQuery<ScheduleQueryData, Error>({
    queryKey: mirrorQueryKey(network, "schedule", id),
    queryFn: () => fetchScheduleQueryData(id, network),
    enabled: (options.enabled ?? true) && isValidEntityId(id),
    retry: false,
    refetchInterval: query =>
      resolvePendingRefetchInterval(
        { isSettled: query.state.data && hasFinalOutcome(query.state.data), error: query.state.error },
        pollIntervalMs,
      ),
  });
}
