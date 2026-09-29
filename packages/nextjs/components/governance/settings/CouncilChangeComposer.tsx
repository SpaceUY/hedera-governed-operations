"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { SETTINGS_COPY } from "./copy";
import {
  type CouncilChange,
  type CouncilRisk,
  changeFrom,
  councilRiskOf,
  draftCouncilChange,
  seatTagOf,
  stepThreshold,
  toggleSeat,
} from "./councilChange";
import { ConnectWallet } from "~~/components/ConnectWallet";
import { monogramOf } from "~~/components/governance/graph/geometry";
import { SeatAvatar } from "~~/components/governance/rail/SeatAvatar";
import { MEMBER_COPY } from "~~/components/governance/rail/copy";
import { type SeatNaming, councilSeatOf, unseatedAgentSeatOf } from "~~/components/governance/rail/councilSeats";
import { CouncilPreviewPanel } from "~~/components/governance/wizard/CouncilPreviewPanel";
import { ProposalSubmitFooter } from "~~/components/governance/wizard/ProposalSubmitFooter";
import { useProposalWizard } from "~~/components/governance/wizard/ProposalWizardProvider";
import { OPEN_PROPOSAL_NOTICES, openProposalCopy } from "~~/components/governance/wizard/copy";
import { agentSeatOf } from "~~/components/governance/wizard/kinds/coSigningAgent/agentSeat";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { useAccount } from "~~/hooks/mirror/useAccount";
import type { CouncilQueryData } from "~~/hooks/mirror/useCouncil";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { type DraftResult, isPreviewRecognized } from "~~/services/governance/drafts";
import { canOpenProposal } from "~~/services/governance/proposalActions";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";

const NO_DRAFT: DraftResult = { status: "empty" };
const TAG_CLASSES = { joins: "text-success-ink", leaves: "text-error" } as const;

export type CouncilChangeComposerProps = { council: CouncilQueryData; naming: SeatNaming; config: GovernanceConfig };

/** The seats a change may hold: the council's, then the co-signing agent's while it is not seated and could sign. */
function useOfferedSeats({ council, naming, config }: CouncilChangeComposerProps): string[] {
  const agentSeat = unseatedAgentSeatOf(naming.agent ?? null, council.key);
  const agentAccountId = agentSeat ? (naming.agent?.accountId ?? null) : null;
  // The same query `useCoSigningAgent` already read, so this asks the Mirror Node nothing new.
  const agentAccount = useAccount(agentAccountId, { network: config.network });
  return useMemo(() => {
    if (!agentSeat || !agentAccountId) return council.key.memberKeys;
    const check = agentSeatOf(agentAccountId, { account: agentAccount.data, error: agentAccount.error }, council.key);
    return check.status === "found" ? [...council.key.memberKeys, agentSeat] : council.key.memberKeys;
  }, [agentSeat, agentAccountId, agentAccount.data, agentAccount.error, council.key]);
}

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
  const { council, naming, config } = props;
  const headingId = useId();
  const thresholdId = useId();
  const [change, setChange] = useState<CouncilChange>(() => changeFrom(council.key));
  const offered = useOfferedSeats(props);
  const { accountId, isConnected } = useHederaSigner();
  const { setDraft, preview, submitStatus } = useProposalWizard();

  const result = useMemo(
    () => draftCouncilChange(config.governanceAccountId, change, council.key),
    [config.governanceAccountId, change, council.key],
  );
  useEffect(() => {
    setDraft(result);
  }, [result, setDraft]);
  useEffect(
    () => () => {
      setDraft(NO_DRAFT);
    },
    [setDraft],
  );

  const submitting = submitStatus === "pending";
  const ownPreview = result.status === "ready" && preview?.kind === "councilRotation" ? preview : null;
  const canSubmit =
    canOpenProposal("councilRotation", accountId ?? null, council.proposerAccountIds) &&
    ownPreview !== null &&
    isPreviewRecognized(ownPreview) &&
    !submitting &&
    submitStatus !== "success";

  const currentRule = councilRuleLabel(council.key);
  const proposedRule = councilRuleLabel(change);
  const viewer = naming.proposers.find(proposer => proposer.accountId === accountId);
  const risk = councilRiskOf(change, council.key, viewer?.key ?? null);
  const agentSeat = naming.agent?.seat ?? null;
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
        <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
          {offered.map(seatKey => {
            const seat = councilSeatOf(seatKey, naming);
            const tag = seatTagOf(seatKey, change, council.key);
            const seated = council.key.memberKeys.includes(seatKey);
            return (
              <li key={seatKey}>
                <label className="flex cursor-pointer items-center gap-2 rounded-box border border-base-300 px-3 py-2 text-sm font-semibold has-checked:border-primary has-focus-visible:outline-2 has-focus-visible:outline-primary">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-primary checkbox-sm"
                    checked={change.memberKeys.includes(seatKey)}
                    onChange={() => setChange(current => toggleSeat(current, seatKey, offered))}
                  />
                  <SeatAvatar
                    label={seat.isViewer ? MEMBER_COPY.you : (seat.monogram ?? monogramOf(seat.name))}
                    tone={seated ? "plain" : "ghost"}
                  />
                  <span className="min-w-0 flex-1">{seat.name}</span>
                  {tag && <span className={`text-xs ${TAG_CLASSES[tag]}`}>{SETTINGS_COPY.composer.tags[tag]}</span>}
                </label>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span id={thresholdId} className="text-sm font-semibold">
            {SETTINGS_COPY.composer.thresholdLabel}
          </span>
          <div role="group" aria-labelledby={thresholdId} className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-circle btn-outline btn-sm"
              aria-label={SETTINGS_COPY.composer.fewer}
              disabled={change.threshold <= 1}
              onClick={() => setChange(current => stepThreshold(current, -1))}
            >
              −
            </button>
            <output aria-live="polite" className="min-w-16 text-center text-xl font-bold tabular-nums">
              {proposedRule}
            </output>
            <button
              type="button"
              className="btn btn-circle btn-outline btn-sm"
              aria-label={SETTINGS_COPY.composer.more}
              disabled={change.threshold >= seats}
              onClick={() => setChange(current => stepThreshold(current, 1))}
            >
              +
            </button>
          </div>
        </div>
      </fieldset>

      {risk && (
        <p role="status" className="m-0 rounded-box border border-warning bg-warning/10 p-3 text-sm">
          {riskText(risk, { seats, keepsProposerRole: viewer !== undefined })}
        </p>
      )}
      {!risk && agentTicked && change.threshold >= 2 && (
        <p className="m-0 text-sm text-base-content/70">{SETTINGS_COPY.composer.agentAlone(seats, change.threshold)}</p>
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
        note={SETTINGS_COPY.composer.noteWithoutPreview}
      />
    </section>
  );
};
