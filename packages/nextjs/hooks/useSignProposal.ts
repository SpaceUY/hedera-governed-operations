"use client";

import { GOVERNANCE_MUTATION_KEYS } from "./governanceMutationKeys";
import { useExecuteBeforeDeadline } from "./useWalletRequest";
import { buildScheduleSign } from "@sh/core/governance/schedules";
import { useMutation } from "@tanstack/react-query";

/** One council member's approval. For a rotation this counts toward whichever side (outgoing or
 * incoming) the signer's key belongs to. */
export function useSignProposal() {
  const executeTransaction = useExecuteBeforeDeadline();
  return useMutation({
    mutationKey: GOVERNANCE_MUTATION_KEYS.sign,
    mutationFn: (scheduleId: string) => executeTransaction(buildScheduleSign(scheduleId)),
  });
}
