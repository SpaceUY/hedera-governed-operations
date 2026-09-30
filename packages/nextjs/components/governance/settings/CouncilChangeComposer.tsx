"use client";

import { useId } from "react";
import { MemberRows } from "./MemberRows";
import { SeatChecklist } from "./SeatChecklist";
import { ThresholdStepper } from "./ThresholdStepper";
import { SETTINGS_COPY } from "./copy";
import { type CouncilRisk, councilBlockOf, councilRiskOf, currentCouncilNeedsAgent } from "./councilChange";
import { useCouncilChangeDraft } from "./useCouncilChangeDraft";
import type { UnseatedAgent } from "./useUnseatedAgent";
import { memberKeyOfAccount } from "@sh/core/governance/council";
import { ConnectWallet } from "~~/components/ConnectWallet";
import type { SeatNaming } from "~~/components/governance/rail/councilSeats";
import { CouncilPreviewPanel } from "~~/components/governance/wizard/CouncilPreviewPanel";
import { ProposalSubmitFooter } from "~~/components/governance/wizard/ProposalSubmitFooter";
import { useProposalWizard } from "~~/components/governance/wizard/ProposalWizardProvider";
import { OPEN_PROPOSAL_NOTICES, openProposalCopy } from "~~/components/governance/wizard/copy";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { useAccount } from "~~/hooks/mirror/useAccount";
import type { CouncilQueryData } from "~~/hooks/mirror/useCouncil";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { isPreviewRecognized } from "~~/services/governance/drafts";
import { canOpenProposal } from "~~/services/governance/proposalActions";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";

export type CouncilChangeComposerProps = {
  council: CouncilQueryData;
  naming: SeatNaming;
  config: GovernanceConfig;
  unseatedAgent: UnseatedAgent | null;
};

function riskText(risk: CouncilRisk, facts: { seats: number; keepsProposerRole: boolean }): string {
  if (risk === "anyOneKey") return SETTINGS_COPY.composer.risks.anyOneKey(facts.seats);
  if (risk === "oneLostKeyFreezes") return SETTINGS_COPY.composer.risks.oneLostKeyFreezes(facts.seats);
  return SETTINGS_COPY.composer.risks.viewerLeaves(facts.keepsProposerRole);
}

/**
 * Proposes a new council inline: tick who holds a key, set how many must sign, schedule it with the
 * wallet — one native `AccountUpdate` of the treasury's own key, through the same rotation draft the
 * wizard uses. The draft goes into the governance layout's one draft, which the map previews and whose
 * submit opens the new proposal; the composer empties it on the way out, so the wizard never opens on it.
 */
export const CouncilChangeComposer = (props: CouncilChangeComposerProps) => {
  const { council, naming, config, unseatedAgent } = props;
  const headingId = useId();
  const { change, offered, rows, reads, members, result, toggle, step, addRow, updateRow, removeRow } =
    useCouncilChangeDraft({ council, config, unseatedAgent });
  const { accountId, isConnected } = useHederaSigner();
  const { preview, submitStatus } = useProposalWizard();
  const viewerAccount = useAccount(accountId, { network: config.network });

  const submitting = submitStatus === "pending";
  const ownPreview = result.status === "ready" && preview?.kind === "councilRotation" ? preview : null;
  const agentSeat = naming.agent?.seat ?? null;
  const block = councilBlockOf(change, agentSeat);
  const canSubmit =
    block === null &&
    canOpenProposal("councilRotation", accountId ?? null, council.proposerAccountIds) &&
    ownPreview !== null &&
    isPreviewRecognized(ownPreview) &&
    !submitting &&
    submitStatus !== "success";

  const currentRule = councilRuleLabel(council.key);
  const proposedRule = councilRuleLabel(change);
  const viewerSeat = memberKeyOfAccount(viewerAccount.data?.key ?? null);
  const keepsProposerRole = council.proposerAccountIds.some(id => id === accountId);
  const risk = councilRiskOf(change, council.key, viewerSeat);
  const agentTicked = agentSeat !== null && change.memberKeys.includes(agentSeat);
  const seats = change.memberKeys.length;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-box border border-base-300 p-4">
      <h2 id={headingId} className="m-0 text-xs font-semibold text-base-content/70">
        {SETTINGS_COPY.composer.heading}
      </h2>
      <p className="m-0 text-sm text-base-content/70">{SETTINGS_COPY.composer.intro(currentRule)}</p>

      {!isConnected && (
        <div className="flex flex-col items-start gap-2 rounded-box bg-base-200 p-4">
          <p className="m-0 text-sm">{OPEN_PROPOSAL_NOTICES.connectWallet}</p>
          <ConnectWallet />
        </div>
      )}

      <fieldset disabled={submitting} className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="sr-only">{SETTINGS_COPY.composer.membersLegend}</legend>
        <SeatChecklist
          offered={offered}
          change={change}
          council={council.key}
          naming={naming}
          members={members}
          onToggle={toggle}
        />
        <MemberRows rows={rows} members={members} reads={reads} onChange={updateRow} onRemove={removeRow} />
        {unseatedAgent?.check.status === "invalid" && (
          <p role="status" className="m-0 text-sm text-base-content/60">
            {unseatedAgent.check.message}
          </p>
        )}
        <button type="button" className="btn btn-outline btn-sm self-start" onClick={addRow}>
          {SETTINGS_COPY.composer.members.addMember}
        </button>
        <ThresholdStepper threshold={change.threshold} seats={seats} rule={proposedRule} onStep={step} />
      </fieldset>

      {currentCouncilNeedsAgent(council.key, agentSeat) && (
        <p role="status" className="m-0 rounded-box border border-warning bg-warning/10 p-3 text-sm">
          {SETTINGS_COPY.composer.agentHoldsCouncil(council.key.memberKeys.length - 1, currentRule)}
        </p>
      )}
      {risk && (
        <p role="status" className="m-0 rounded-box border border-warning bg-warning/10 p-3 text-sm">
          {riskText(risk, { seats, keepsProposerRole })}
        </p>
      )}
      {!risk && agentTicked && change.threshold >= 2 && (
        <p className="m-0 text-sm text-base-content/70">{SETTINGS_COPY.composer.agentAlone(seats, change.threshold)}</p>
      )}
      {block && (
        <p role="alert" className="m-0 text-sm text-error">
          {SETTINGS_COPY.composer.agentBlocks(block.otherKeys, proposedRule)}
        </p>
      )}
      {result.status === "invalid" && (
        <p role="alert" className="m-0 text-sm text-error">
          {result.message}
        </p>
      )}

      <p role="note" className="m-0 text-sm leading-normal">
        {SETTINGS_COPY.composer.bothCouncils(currentRule, proposedRule)}
      </p>
      <p className="m-0 text-sm text-base-content/60 leading-normal">{SETTINGS_COPY.composer.agentNeverSigns}</p>

      {ownPreview && <CouncilPreviewPanel preview={ownPreview} council={council.key} headingLevel={3} />}

      <ProposalSubmitFooter
        canSubmit={canSubmit}
        cta={openProposalCopy("councilRotation").cta}
        note={SETTINGS_COPY.composer.note}
      />
    </section>
  );
};
