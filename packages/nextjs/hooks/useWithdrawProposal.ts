"use client";

import { useExecuteBeforeDeadline } from "./useWalletRequest";
import { buildScheduleDelete } from "@sh/core/governance/schedules";
import { useMutation } from "@tanstack/react-query";

/** Ends this round of signing. The registry entry, if any, stays pending and can be scheduled
 * again — this is not the same as cancelling (see `useCancelProposal`). */
export function useWithdrawProposal() {
  const executeTransaction = useExecuteBeforeDeadline();
  return useMutation({ mutationFn: (scheduleId: string) => executeTransaction(buildScheduleDelete(scheduleId)) });
}
