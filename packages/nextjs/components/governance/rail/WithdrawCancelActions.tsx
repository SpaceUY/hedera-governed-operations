"use client";

import { useState } from "react";
import type { Proposal } from "@sh/core/governance/proposals";
import { MutationError } from "~~/components/governance/MutationError";
import { useAccount } from "~~/hooks/mirror/useAccount";
import { useCancelProposal } from "~~/hooks/useCancelProposal";
import { useWithdrawProposal } from "~~/hooks/useWithdrawProposal";
import {
  canBeWithdrawnBy,
  canCancelRegistryEntry,
  cancellableRegistryId,
} from "~~/services/governance/proposalActions";
import {
  CANCEL_UNAUTHORIZED_NOTE,
  CANCEL_VS_EXPIRE_NOTE,
  WITHDRAW_BEFORE_CANCEL_NOTE,
} from "~~/services/governance/proposalLabels";

export type WithdrawCancelActionsProps = {
  proposal: Proposal;
  accountId: string | null;
  executorContractId: string;
  governanceAccountId: string;
  onWithdrawn: () => void;
  onCancelled: () => void;
};

/**
 * Withdraw and Cancel, kept as two separate controls: they end different things (one approval round
 * versus the proposal for good, see `docs/GOVERNANCE_UI.md`), so a single merged button would hide
 * which one is about to happen. Cancel is only ever shown to whoever `GovernedExecutor.cancel` would
 * actually accept — the entry's own proposer, or the governance account — with the reason spelled out
 * for everyone else instead of an unexplained disabled button, and it asks for confirmation in place
 * before sending the transaction, matching this app's own habit of an inline second step rather than
 * a native `confirm()`.
 */
export const WithdrawCancelActions = ({
  proposal,
  accountId,
  executorContractId,
  governanceAccountId,
  onWithdrawn,
  onCancelled,
}: WithdrawCancelActionsProps) => {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const withdraw = useWithdrawProposal();
  const cancel = useCancelProposal();

  const isWithdrawable = canBeWithdrawnBy(proposal, accountId);
  const cancellableProposalId = cancellableRegistryId(proposal);
  const entryProposer = proposal.registry.status === "read" ? proposal.registry.entry.proposer : null;

  const account = useAccount(accountId, { enabled: cancellableProposalId != null });
  const governance = useAccount(governanceAccountId, { enabled: cancellableProposalId != null });
  const authorizingCancel = cancellableProposalId != null && (account.isLoading || governance.isLoading);
  const authorizedToCancel =
    cancellableProposalId != null &&
    entryProposer !== null &&
    canCancelRegistryEntry(entryProposer, account.data?.evm_address ?? null, governance.data?.evm_address ?? null);

  if (!isWithdrawable && cancellableProposalId == null) return null;

  return (
    <div className="flex flex-col gap-3">
      {isWithdrawable && (
        <div className="flex flex-col gap-1">
          <button
            className="btn btn-ghost self-start"
            onClick={() => withdraw.mutate(proposal.schedule.schedule_id, { onSuccess: onWithdrawn })}
            disabled={withdraw.isPending}
          >
            Withdraw my approval round
          </button>
          <MutationError error={withdraw.error} />
          <p className="text-sm text-base-content/60">
            Withdrawing deletes the schedule and every signature on it; only you, as the proposer, can do it.
            {proposal.operation.kind === "registryCall" && ` ${WITHDRAW_BEFORE_CANCEL_NOTE}`}
          </p>
        </div>
      )}

      {cancellableProposalId != null && (
        <div className="flex flex-col gap-1">
          {authorizingCancel ? (
            <span className="loading loading-spinner loading-sm" aria-label="Checking who can cancel" />
          ) : authorizedToCancel ? (
            confirmingCancel ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm">Cancel this proposal for good?</span>
                <button
                  className="btn btn-error btn-sm"
                  onClick={() =>
                    cancel.mutate(
                      { executorContractId, registryProposalId: cancellableProposalId },
                      {
                        onSuccess: () => {
                          setConfirmingCancel(false);
                          onCancelled();
                        },
                      },
                    )
                  }
                  disabled={cancel.isPending}
                >
                  Confirm cancel
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setConfirmingCancel(false)}
                  disabled={cancel.isPending}
                >
                  Never mind
                </button>
              </div>
            ) : (
              <button
                className="btn btn-error btn-outline self-start"
                onClick={() => setConfirmingCancel(true)}
                disabled={cancel.isPending}
              >
                Cancel this proposal
              </button>
            )
          ) : (
            <p className="text-sm text-base-content/60">{CANCEL_UNAUTHORIZED_NOTE}</p>
          )}
          <MutationError error={cancel.error} />
          <p className="text-sm text-base-content/60">{CANCEL_VS_EXPIRE_NOTE}</p>
        </div>
      )}
    </div>
  );
};
