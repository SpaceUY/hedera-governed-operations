"use client";

import { useHederaSigner } from "./useHederaSigner";
import { useMutation } from "@tanstack/react-query";
import { buildScheduleDelete } from "~~/services/governance/schedules";

/** Ends this round of signing. The registry entry, if any, stays pending and can be scheduled
 * again — this is not the same as cancelling (see `useCancelProposal`). */
export function useWithdrawProposal() {
  const { executeTransaction } = useHederaSigner();
  return useMutation({ mutationFn: (scheduleId: string) => executeTransaction(buildScheduleDelete(scheduleId)) });
}
