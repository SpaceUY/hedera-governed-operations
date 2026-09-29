"use client";

import { CouncilPreviewPanel, type HeadingLevel } from "./CouncilPreviewPanel";
import { OperationTypePicker } from "./OperationTypePicker";
import { useProposalWizard } from "./ProposalWizardProvider";
import {
  OPEN_PROPOSAL_NOTICES,
  lateSubmissionLabel,
  missingProposerRoleLabel,
  openProposalCopy,
  scheduleRegisteredEntryCopy,
  walletRequestLabel,
} from "./copy";
import { WIZARD_KIND_ENTRIES } from "./kinds/registry";
import type { WizardKind } from "./kinds/wizardKinds";
import { isContractProposalKind } from "@sh/core/governance/proposalTypes";
import type { Chain } from "viem";
import { ConnectWallet } from "~~/components/ConnectWallet";
import { MutationError } from "~~/components/governance/MutationError";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { useCouncil } from "~~/hooks/mirror/useCouncil";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { isPreviewRecognized } from "~~/services/governance/drafts";
import { canOpenProposal } from "~~/services/governance/proposalActions";

type ProposalWizardProps = {
  config: GovernanceConfig;
  chain: Chain;
  /** One below the heading the host gives the wizard, e.g. 2 under a page's h1. */
  headingLevel: HeadingLevel;
};

type CouncilRead = ReturnType<typeof useCouncil>;

/** Why a connected account cannot open this kind yet, or null when nothing stands in the way. */
function proposerNotice(
  kind: WizardKind,
  accountId: string | null,
  council: CouncilRead,
  allowed: boolean,
): string | null {
  if (!accountId || !isContractProposalKind(kind)) return null;
  if (council.isError) return OPEN_PROPOSAL_NOTICES.proposersUnreadable;
  if (!council.data) return OPEN_PROPOSAL_NOTICES.proposersLoading;
  if (!allowed) return missingProposerRoleLabel(accountId);
  return null;
}

/**
 * The wizard's body and footer, with no route, title or setup guard of its own: the host renders
 * those, wraps it in a `ProposalWizardProvider` and gives it a height. It fills that height, scrolls
 * its middle and keeps the submit button in view.
 */
export const ProposalWizard = ({ config, chain, headingLevel }: ProposalWizardProps) => {
  const { network, governanceAccountId } = config;
  const { accountId, isConnected, signerKind } = useHederaSigner();
  const council = useCouncil({ governanceAccountId, executorContractId: config.executor.hederaContractId, network });
  const {
    kind,
    chooseKind,
    draft,
    setDraft,
    preview,
    submitStatus,
    submitError,
    walletRequest,
    lateSubmission,
    submit,
    resumableEntry,
  } = useProposalWizard();
  const submitting = submitStatus === "pending";

  // A kind that cannot be proposed here says why in place of its form, before anything about roles.
  const opened = WIZARD_KIND_ENTRIES[kind].open({ config, chain });
  const allowed = canOpenProposal(kind, accountId, council.data?.proposerAccountIds ?? []);
  const notice = opened.status === "unavailable" ? opened.notice : proposerNotice(kind, accountId, council, allowed);
  const canSubmit =
    allowed && preview !== null && isPreviewRecognized(preview) && !submitting && submitStatus !== "success";
  const copy = resumableEntry ? scheduleRegisteredEntryCopy(resumableEntry) : openProposalCopy(kind);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pt-4 pb-6">
        {!isConnected && (
          <div className="rounded-box bg-base-200 p-4 flex flex-col items-start gap-2">
            <p className="m-0 text-sm">{OPEN_PROPOSAL_NOTICES.connectWallet}</p>
            <ConnectWallet />
          </div>
        )}

        {/*
          Disabled while the wallet signs, the form as well as the picker: switching kind would reset the
          submission it is waiting on, and editing a field would leave a failed schedule's retry holding
          the old calldata, so it would register a second entry for the same decision.
        */}
        <fieldset disabled={submitting} className="contents">
          <OperationTypePicker value={kind} onChange={chooseKind} council={council.data?.key} />
          {opened.status === "available" &&
            opened.renderForm({ network, chain, council: council.data?.key, onDraftChange: setDraft })}
        </fieldset>

        {draft.status === "invalid" && (
          <p role="alert" className="m-0 text-sm text-error">
            {draft.message}
          </p>
        )}

        {preview && <CouncilPreviewPanel preview={preview} council={council.data?.key} headingLevel={headingLevel} />}

        {notice && (
          <p role="status" className="m-0 text-sm text-warning">
            {notice}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-base-300 bg-base-100 px-6 pt-4 pb-5">
        <button className="btn btn-primary btn-block min-h-12" onClick={submit} disabled={!canSubmit}>
          {submitting ? (
            <span className="loading loading-spinner loading-sm" aria-label="Waiting for the wallet" />
          ) : (
            copy.cta
          )}
        </button>
        {walletRequest ? (
          <p role="status" className="m-0 text-sm text-info leading-normal">
            {walletRequestLabel(walletRequest, signerKind)}
          </p>
        ) : (
          <p className="m-0 text-sm text-base-content/60 leading-normal">{copy.note}</p>
        )}
        <MutationError error={submitError} />
        {lateSubmission && (
          <p role="status" className="m-0 text-sm text-info leading-normal">
            {lateSubmissionLabel(lateSubmission)}
          </p>
        )}
      </div>
    </div>
  );
};
