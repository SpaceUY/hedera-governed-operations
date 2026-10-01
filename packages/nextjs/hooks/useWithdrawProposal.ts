"use client";

import { useState } from "react";
import { useTargetNetwork } from "./scaffold-hbar";
import { useExecuteBeforeDeadline } from "./useWalletRequest";
import { buildScheduleDelete } from "@sh/core/governance/schedules";
import { useMutation } from "@tanstack/react-query";
import { waitForTransactionRow } from "~~/services/governance/transactionRow";
import { getHederaNetworkNameFromChainId } from "~~/utils/scaffold-hbar/networks";

/**
 * Names every withdrawal in the mutation cache, so a screen can tell a schedule this browser already
 * deleted from one Mirror still reports live for a few seconds (`useCancelProposalFlow`). A withdrawal
 * only succeeds once the network has accepted the delete, so a success here means the schedule is gone.
 */
export const WITHDRAW_PROPOSAL_MUTATION_KEY = ["governance", "withdraw-proposal"] as const;

const SCHEDULE_DELETE_ROW = "SCHEDULEDELETE";

/** A delete refused this way still leaves the schedule gone, which is all a withdrawal is for. */
const SCHEDULE_GONE_RESULTS = ["SUCCESS", "SCHEDULE_ALREADY_DELETED"];

/** The network refused the delete at consensus, so the schedule is still live. */
export class ScheduleDeleteRefusedError extends Error {
  override readonly name = "ScheduleDeleteRefusedError";

  constructor(
    readonly scheduleId: string,
    readonly result: string,
  ) {
    super(`The network refused deleting schedule ${scheduleId} (${result}), so it is still live`);
  }
}

/**
 * Ends this round of signing. The registry entry, if any, stays pending and can be scheduled
 * again — this is not the same as cancelling (see `useCancelProposal`).
 *
 * The wallet answers before consensus, and a delete can still be refused there — by a proposer key
 * rotated since the schedule was created (`INVALID_SIGNATURE`), or by the last signature landing
 * first (`SCHEDULE_ALREADY_EXECUTED`). So the withdrawal waits for the delete's Mirror row and only
 * succeeds on a result that leaves the schedule gone: a cancel sent after a refused delete would
 * leave a live schedule on a cancelled entry, which reverts and bills the governance account.
 */
export function useWithdrawProposal() {
  const executeTransaction = useExecuteBeforeDeadline();
  const { targetNetwork } = useTargetNetwork();
  const network = getHederaNetworkNameFromChainId(targetNetwork.id);
  const [isConfirming, setIsConfirming] = useState(false);

  const mutation = useMutation({
    mutationKey: WITHDRAW_PROPOSAL_MUTATION_KEY,
    mutationFn: async (scheduleId: string) => {
      const { transactionId } = await executeTransaction(buildScheduleDelete(scheduleId));
      setIsConfirming(true);
      try {
        const row = await waitForTransactionRow({ transactionId, name: SCHEDULE_DELETE_ROW, network });
        if (!row) {
          throw new Error(
            `The delete (transaction ${transactionId}) is not on Mirror yet, so it is not confirmed. ` +
              "Wait a moment and look at the schedule before trying again.",
          );
        }
        if (!SCHEDULE_GONE_RESULTS.includes(row.result)) throw new ScheduleDeleteRefusedError(scheduleId, row.result);
        return { transactionId };
      } finally {
        setIsConfirming(false);
      }
    },
  });

  return { ...mutation, isConfirming };
}
