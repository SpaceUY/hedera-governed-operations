"use client";

import { useCancelProposal } from "./useCancelProposal";
import { WITHDRAW_PROPOSAL_MUTATION_KEY, useWithdrawProposal } from "./useWithdrawProposal";
import { useMutationState } from "@tanstack/react-query";
import type { CancelPlan } from "~~/services/governance/proposalActions";

/**
 * The schedule on screen, and what cancelling it would send: null when there is no registry entry the
 * viewer could cancel, in which case `start` sends nothing.
 */
export type CancelFlowTarget = { scheduleId: string; executorContractId: string; plan: CancelPlan | null };

export type CancelFlowCallbacks = {
  /** After the schedule was deleted, whether or not the cancel then went through: re-read it. */
  onWithdrawn: () => void;
  /** After `cancel(id)` was sent. */
  onCancelled: () => void;
};

/**
 * - `idle`: nothing sent yet, or the last attempt was refused before anything changed.
 * - `withdrawing` / `cancelling`: the wallet is asked for step 1 or step 2.
 * - `withdrawnNotCancelled`: the schedule is gone but the entry is still pending — step 2 failed, was
 *   rejected, or has not been asked for yet. Starting again sends the cancel alone.
 * - `cancelled`: both done.
 */
export type CancelFlowStep = "idle" | "withdrawing" | "cancelling" | "withdrawnNotCancelled" | "cancelled";

/**
 * Cancel as one guided action: delete the live schedule, then `cancel(id)` — two wallet approvals,
 * in that order, since a schedule left alive on a cancelled entry can still reach its threshold,
 * revert and bill the governance account. With nothing live to delete it is the cancel alone.
 *
 * Whether the schedule is already gone is read from the mutation cache, not from this hook's state:
 * Mirror reports a deleted schedule as live for a few seconds, and the card holding this panel moves
 * to another list — remounting it — once Mirror catches up. A cancel that failed after the delete
 * therefore never deletes again; it resumes at step 2. Each step's error stays on its own mutation,
 * so a wallet rejection reads as a rejection.
 */
export function useCancelProposalFlow(target: CancelFlowTarget, { onWithdrawn, onCancelled }: CancelFlowCallbacks) {
  const withdraw = useWithdrawProposal();
  const cancel = useCancelProposal();
  const withdrawnHere =
    useMutationState({
      filters: {
        mutationKey: WITHDRAW_PROPOSAL_MUTATION_KEY,
        status: "success",
        predicate: mutation => mutation.state.variables === target.scheduleId,
      },
    }).length > 0;

  const start = async () => {
    const { plan } = target;
    if (!plan) return;
    let deleted = false;
    try {
      if (plan.withdrawFirst && !withdrawnHere) {
        await withdraw.mutateAsync(target.scheduleId);
        deleted = true;
      }
      await cancel.mutateAsync({
        executorContractId: target.executorContractId,
        registryProposalId: plan.registryProposalId,
      });
      onCancelled();
    } catch {
      // The failed step's own mutation holds the error, which is what the screen shows.
    }
    if (deleted) onWithdrawn();
  };

  return { step: stepOf(withdraw, cancel, withdrawnHere), start, error: withdraw.error ?? cancel.error };
}

type MutationFacts = { isPending: boolean; isSuccess: boolean };

function stepOf(withdraw: MutationFacts, cancel: MutationFacts, withdrawnHere: boolean): CancelFlowStep {
  if (withdraw.isPending) return "withdrawing";
  if (cancel.isPending) return "cancelling";
  if (cancel.isSuccess) return "cancelled";
  return withdrawnHere ? "withdrawnNotCancelled" : "idle";
}
