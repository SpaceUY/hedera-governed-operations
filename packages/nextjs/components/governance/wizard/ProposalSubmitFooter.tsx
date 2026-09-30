"use client";

import { useProposalWizard } from "./ProposalWizardProvider";
import { lateSubmissionLabel, walletRequestLabel } from "./copy";
import { MutationError } from "~~/components/governance/MutationError";
import { useHederaSigner } from "~~/hooks/useHederaSigner";

export type ProposalSubmitFooterProps = { canSubmit: boolean; cta: string; note: string };

/**
 * The submit for the governance layout's one draft, and what happens to it: a spinner while the wallet
 * signs, where to approve while it holds the request, the error if it failed, a step the network
 * accepted after the wait ended. The host decides whether the draft may be submitted and what the
 * button says; the wizard and Settings both render it.
 */
export const ProposalSubmitFooter = ({ canSubmit, cta, note }: ProposalSubmitFooterProps) => {
  const { signerKind } = useHederaSigner();
  const { submit, submitStatus, submitError, walletRequest, lateSubmission } = useProposalWizard();
  return (
    <>
      <button className="btn btn-primary btn-block min-h-12" onClick={submit} disabled={!canSubmit}>
        {submitStatus === "pending" ? (
          <span className="loading loading-spinner loading-sm" aria-label="Waiting for the wallet" />
        ) : (
          cta
        )}
      </button>
      {walletRequest ? (
        <p role="status" className="m-0 text-sm text-info leading-normal">
          {walletRequestLabel(walletRequest, signerKind)}
        </p>
      ) : (
        <p className="m-0 text-sm text-base-content/60 leading-normal">{note}</p>
      )}
      <MutationError error={submitError} />
      {lateSubmission && (
        <p role="status" className="m-0 text-sm text-info leading-normal">
          {lateSubmissionLabel(lateSubmission)}
        </p>
      )}
    </>
  );
};
