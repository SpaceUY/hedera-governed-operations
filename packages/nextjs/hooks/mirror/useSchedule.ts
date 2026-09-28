"use client";

import {
  DEFAULT_PENDING_POLL_MS,
  type MirrorQueryOptions,
  getDefaultMirrorNetwork,
  mirrorQueryKey,
  resolvePendingRefetchInterval,
} from "./mirrorQuery";
import {
  type MirrorSchedule,
  type ScheduleState,
  deriveScheduleState,
  fetchSchedule,
  isValidEntityId,
} from "@sh/core/mirror";
import { useQuery } from "@tanstack/react-query";

export type ScheduleQueryData = {
  schedule: MirrorSchedule;
  state: ScheduleState;
};

/**
 * Reads a schedule from Mirror and derives its state.
 * Polls while pending (or not yet indexed) and stops once executed, deleted or expired.
 */
export function useSchedule(scheduleId: string | null | undefined, options: MirrorQueryOptions = {}) {
  const network = options.network ?? getDefaultMirrorNetwork();
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_PENDING_POLL_MS;
  const id = scheduleId?.trim() ?? "";

  return useQuery<ScheduleQueryData, Error>({
    queryKey: mirrorQueryKey(network, "schedule", id),
    queryFn: async () => {
      const schedule = await fetchSchedule(id, { network });
      return { schedule, state: deriveScheduleState(schedule) };
    },
    enabled: (options.enabled ?? true) && isValidEntityId(id),
    retry: false,
    refetchInterval: query =>
      resolvePendingRefetchInterval(
        { isSettled: query.state.data?.state.isSettled, error: query.state.error },
        pollIntervalMs,
      ),
  });
}
