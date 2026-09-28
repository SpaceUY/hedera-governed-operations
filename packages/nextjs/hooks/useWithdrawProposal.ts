"use client";

import { useHederaSigner } from "./useHederaSigner";
import { buildScheduleDelete } from "@sh/core/governance/schedules";
import { useMutation } from "@tanstack/react-query";

/**
 * Names every withdrawal in the mutation cache, so a screen can tell a schedule this browser already
 * deleted from one Mirror still reports live for a few seconds (`useCancelProposalFlow`).
 */
export const WITHDRAW_PROPOSAL_MUTATION_KEY = ["governance", "withdraw-proposal"] as const;

/** Ends this round of signing. The registry entry, if any, stays pending and can be scheduled
 * again — this is not the same as cancelling (see `useCancelProposal`). */
export function useWithdrawProposal() {
  const { executeTransaction } = useHederaSigner();
  return useMutation({
    mutationKey: WITHDRAW_PROPOSAL_MUTATION_KEY,
    mutationFn: (scheduleId: string) => executeTransaction(buildScheduleDelete(scheduleId)),
  });
}
