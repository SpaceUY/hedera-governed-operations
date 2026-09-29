"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CANCEL_COPY, WITHDRAW_COPY } from "./copy";
import type { Proposal } from "@sh/core/governance/proposals";
import { MutationError } from "~~/components/governance/MutationError";
import { GOVERNANCE_ROUTES } from "~~/config/governanceConfig";
import { useAccount } from "~~/hooks/mirror/useAccount";
import { useProposals } from "~~/hooks/mirror/useProposals";
import { type CancelFlowStep, useCancelProposalFlow } from "~~/hooks/useCancelProposalFlow";
import { useWithdrawProposal } from "~~/hooks/useWithdrawProposal";
import {
  canBeWithdrawnBy,
  canCancelRegistryEntry,
  cancelPlanOf,
  otherOpenScheduleOf,
} from "~~/services/governance/proposalActions";

export type WithdrawCancelActionsProps = {
  proposal: Proposal;
  accountId: string | null;
  executorContractId: string;
  governanceAccountId: string;
  network: string;
  onWithdrawn: () => void;
  onCancelled: () => void;
};

/** The registry entry behind a registry call while it can still be cancelled, or null. */
function openEntryIdOf({ operation, registry }: Pick<Proposal, "operation" | "registry">): number | null {
  if (operation.kind !== "registryCall" || registry.status !== "read") return null;
  return registry.entry.state === "pending" ? registry.entry.proposalId : null;
}

const ActionCard = ({ tone, children }: { tone: "neutral" | "error"; children: ReactNode }) => (
  <div
    className={`flex flex-col items-start gap-2 rounded-box border p-3 ${
      tone === "error" ? "border-error/50" : "border-base-300"
    }`}
  >
    {children}
  </div>
);

const Note = ({ children }: { children: ReactNode }) => <p className="m-0 text-xs text-base-content/70">{children}</p>;

const PROGRESS_OF: Partial<Record<CancelFlowStep, (withdrawFirst: boolean) => string>> = {
  withdrawing: () => CANCEL_COPY.progress.withdrawing,
  confirmingWithdraw: () => CANCEL_COPY.progress.confirmingWithdraw,
  cancelling: withdrawFirst =>
    withdrawFirst ? CANCEL_COPY.progress.cancellingAfterWithdraw : CANCEL_COPY.progress.cancelling,
};

/**
 * Withdraw and Cancel, side by side as two separate cards: they end different things (one approval
 * round versus the proposal for good, see `docs/GOVERNANCE_UI.md`), so a single merged button would
 * hide which one is about to happen.
 *
 * Cancel is one guided action (`useCancelProposalFlow`): with the viewed schedule still live it deletes
 * that schedule first and cancels the entry second — two wallet approvals, in that order, spelled out
 * in an inline confirmation before anything is sent — and with nothing live it is the cancel alone.
 * If the delete went through and the cancel did not, the card says so and offers the cancel alone. It
 * is only offered to whoever `GovernedExecutor.cancel` would accept — the entry's own proposer, or the
 * governance account — with the reason spelled out for everyone else, and never while another
 * schedule for the same entry could still reach its threshold.
 */
export const WithdrawCancelActions = ({
  proposal,
  accountId,
  executorContractId,
  governanceAccountId,
  network,
  onWithdrawn,
  onCancelled,
}: WithdrawCancelActionsProps) => {
  const [confirming, setConfirming] = useState(false);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const withdraw = useWithdrawProposal();

  const scheduleId = proposal.schedule.schedule_id;
  const isContract = proposal.operation.kind === "registryCall";
  const entryId = openEntryIdOf(proposal);
  const plan = cancelPlanOf(proposal, accountId);
  // Once this schedule is gone but Mirror still shows it live, `cancelPlanOf` has no plan: resuming
  // at step 2 cancels the open entry alone.
  const cancelTarget = plan ?? (entryId === null ? null : { registryProposalId: entryId, withdrawFirst: false });
  const flow = useCancelProposalFlow(
    { scheduleId, executorContractId, plan: cancelTarget },
    { onWithdrawn, onCancelled },
  );

  const readsForCancel = { network, enabled: entryId != null };
  const account = useAccount(accountId, readsForCancel);
  const governance = useAccount(governanceAccountId, readsForCancel);
  // The same inbox query the map already keeps polling, so this adds no read of its own.
  const { inbox } = useProposals({ governanceAccountId, executorContractId, ...readsForCancel });
  const openSchedule = otherOpenScheduleOf(proposal, inbox.data?.proposals ?? []);
  const authorizing = entryId != null && (account.isLoading || governance.isLoading || inbox.isLoading);
  const entryProposer = proposal.registry.status === "read" ? proposal.registry.entry.proposer : null;
  const authorized =
    entryProposer !== null &&
    canCancelRegistryEntry(entryProposer, account.data?.evm_address ?? null, governance.data?.evm_address ?? null);

  const cancelFlowStarted = flow.step !== "idle";
  // While the round is live, Cancel is only worth a card to someone who could end up pressing it:
  // anyone else reads the reason once the round is over, where Cancel is the only way left.
  const showCancel =
    entryId != null && (authorizing || authorized || cancelFlowStarted || proposal.state.status !== "pending");
  const showWithdraw = canBeWithdrawnBy(proposal, accountId) && !cancelFlowStarted;
  const busy =
    withdraw.isPending ||
    flow.step === "withdrawing" ||
    flow.step === "confirmingWithdraw" ||
    flow.step === "cancelling";

  // The control that opened or closed the confirmation is gone once it did: focus follows to its replacement.
  const wasConfirming = useRef(confirming);
  useEffect(() => {
    if (wasConfirming.current === confirming) return;
    wasConfirming.current = confirming;
    (confirming ? confirmButton : cancelButton).current?.focus();
  }, [confirming]);

  if (!showWithdraw && !showCancel) return null;

  const start = () => {
    setConfirming(false);
    void flow.start();
  };

  if (confirming && plan) {
    const oneStep = !plan.withdrawFirst || flow.step === "withdrawnNotCancelled";
    return (
      <div
        role="group"
        aria-label={CANCEL_COPY.button}
        className="flex flex-col gap-3 rounded-box border border-error bg-error/10 p-4"
      >
        <p className="m-0 text-sm font-semibold">{oneStep ? CANCEL_COPY.oneStep.title : CANCEL_COPY.twoSteps.title}</p>
        {!oneStep && (
          <>
            <ol className="m-0 list-decimal pl-5 text-sm">
              {CANCEL_COPY.twoSteps.steps.map(step => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <Note>{CANCEL_COPY.twoSteps.why(proposal.progress.threshold)}</Note>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <button ref={confirmButton} type="button" className="btn btn-error btn-outline btn-sm" onClick={start}>
            {oneStep ? CANCEL_COPY.oneStep.confirm : CANCEL_COPY.twoSteps.confirm}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
            {CANCEL_COPY.keep}
          </button>
        </div>
      </div>
    );
  }

  const progress = PROGRESS_OF[flow.step]?.(plan?.withdrawFirst ?? false);

  return (
    <div className="flex flex-col gap-3 @container">
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
        {showWithdraw && (
          <ActionCard tone="neutral">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => withdraw.mutate(scheduleId, { onSuccess: onWithdrawn })}
              disabled={busy}
            >
              {WITHDRAW_COPY.button}
            </button>
            <Note>{isContract ? WITHDRAW_COPY.why.contract : WITHDRAW_COPY.why.native}</Note>
            <MutationError error={withdraw.error} />
          </ActionCard>
        )}

        {showCancel && (
          <ActionCard tone="error">
            {authorizing ? (
              <span role="status" aria-label={CANCEL_COPY.checking} className="skeleton h-8 w-40" />
            ) : openSchedule ? (
              <Note>
                {CANCEL_COPY.blockedByOpenSchedule}{" "}
                <Link className="link" href={GOVERNANCE_ROUTES.proposal(openSchedule)}>
                  {openSchedule}
                </Link>
              </Note>
            ) : !authorized ? (
              <Note>{CANCEL_COPY.unauthorized}</Note>
            ) : progress ? (
              <p role="status" className="m-0 text-sm">
                {progress}
              </p>
            ) : flow.step === "withdrawnNotCancelled" ? (
              <>
                <Note>{CANCEL_COPY.withdrawnNotCancelled.text}</Note>
                <button type="button" className="btn btn-error btn-outline btn-sm" onClick={start}>
                  {CANCEL_COPY.withdrawnNotCancelled.button}
                </button>
              </>
            ) : plan ? (
              <>
                <button
                  ref={cancelButton}
                  type="button"
                  className="btn btn-error btn-outline btn-sm"
                  onClick={() => setConfirming(true)}
                  disabled={busy}
                >
                  {CANCEL_COPY.button}
                </button>
                <Note>{plan.withdrawFirst ? CANCEL_COPY.whyLive : CANCEL_COPY.whyAlone}</Note>
              </>
            ) : (
              <Note>{CANCEL_COPY.afterTheRound}</Note>
            )}
            <MutationError error={flow.error} />
          </ActionCard>
        )}
      </div>
      {showWithdraw && !isContract && <Note>{WITHDRAW_COPY.nativeNoCancel}</Note>}
    </div>
  );
};
