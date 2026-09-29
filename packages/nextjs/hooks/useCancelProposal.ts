"use client";

import { useExecuteBeforeDeadline } from "./useWalletRequest";
import { buildCancelProposalCall } from "@sh/core/governance/registry";
import { useMutation } from "@tanstack/react-query";

export type CancelProposalInput = { executorContractId: string; registryProposalId: number };

/** Ends the proposal for good — no schedule, no quorum. If a schedule is still live for it,
 * delete that first (`useWithdrawProposal`): a schedule that later reaches threshold on a
 * cancelled proposal reverts and the treasury still pays the gas consumed. Gas is
 * `CANCEL_PROPOSAL_GAS`, fixed inside `buildCancelProposalCall` — not passed by the caller. */
export function useCancelProposal() {
  const executeTransaction = useExecuteBeforeDeadline();
  return useMutation({
    mutationFn: ({ executorContractId, registryProposalId }: CancelProposalInput) =>
      executeTransaction(buildCancelProposalCall(executorContractId, registryProposalId)),
  });
}
