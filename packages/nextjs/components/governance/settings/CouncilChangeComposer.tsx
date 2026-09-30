"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { SETTINGS_COPY } from "./copy";
import {
  type CouncilChange,
  type CouncilRisk,
  changeFrom,
  councilBlockOf,
  councilRiskOf,
  draftCouncilChange,
  offeredSeatsOf,
  reoffer,
  seatTagOf,
  stepThreshold,
  toggleSeat,
} from "./councilChange";
import { type MemberSeat, memberKeysOf } from "./memberAccounts";
import type { UnseatedAgent } from "./useUnseatedAgent";
import { HederaAddressInput } from "@scaffold-hbar-ui/components";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { ConnectWallet } from "~~/components/ConnectWallet";
import { monogramOf } from "~~/components/governance/graph/geometry";
import { SeatAvatar } from "~~/components/governance/rail/SeatAvatar";
import { MEMBER_COPY } from "~~/components/governance/rail/copy";
import { type SeatNaming, councilSeatOf } from "~~/components/governance/rail/councilSeats";
import { CouncilPreviewPanel } from "~~/components/governance/wizard/CouncilPreviewPanel";
import { ProposalSubmitFooter } from "~~/components/governance/wizard/ProposalSubmitFooter";
import { useProposalWizard } from "~~/components/governance/wizard/ProposalWizardProvider";
import { ACCOUNT_LOOKUP_LABELS, OPEN_PROPOSAL_NOTICES, openProposalCopy } from "~~/components/governance/wizard/copy";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { type AccountListRead, useAccounts } from "~~/hooks/mirror/useAccounts";
import type { CouncilQueryData } from "~~/hooks/mirror/useCouncil";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { type DraftResult, isPreviewRecognized } from "~~/services/governance/drafts";
import { canOpenProposal } from "~~/services/governance/proposalActions";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";

const NO_DRAFT: DraftResult = { status: "empty" };
const TAG_CLASSES = { joins: "text-success-ink", leaves: "text-error" } as const;

export type CouncilChangeComposerProps = {
  council: CouncilQueryData;
  naming: SeatNaming;
  config: GovernanceConfig;
  unseatedAgent: UnseatedAgent | null;
};

/** An account row keeps its id while the rows around it are added and removed. */
type MemberRow = { id: number; input: string };

const sameSeats = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((key, index) => key === b[index]);

/** What a row says under itself: still looking, empty, or why it adds no seat. */
function rowStatusText(position: number, input: string, row: MemberSeat, read: AccountListRead | undefined) {
  if (input === "") return SETTINGS_COPY.composer.members.emptyMember(position);
  if (read?.isLoading) return ACCOUNT_LOOKUP_LABELS.loading(input);
  if (row.status === "invalid" || row.status === "offered") return row.message;
  return null;
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
  const { council, naming, config, unseatedAgent } = props;
  const headingId = useId();
  const thresholdId = useId();
  const [change, setChange] = useState<CouncilChange>(() => changeFrom(council.key));
  const councilOffered = useMemo(() => offeredSeatsOf(council.key, unseatedAgent), [council.key, unseatedAgent]);
  const { targetNetwork } = useTargetNetwork();

  const nextRowId = useRef(0);
  const [rows, setRows] = useState<MemberRow[]>([]);
  const memberInputs = useMemo(() => rows.map(row => row.input.trim()), [rows]);
  const reads = useAccounts(memberInputs, { network: config.network });
  const members = useMemo(
    () => memberKeysOf(memberInputs, reads, councilOffered),
    [memberInputs, reads, councilOffered],
  );
  const offered = useMemo(() => [...councilOffered, ...members.memberKeys], [councilOffered, members.memberKeys]);
  // A seat an added row resolves to comes in ticked; one whose row is removed or edited goes.
  const [added, setAdded] = useState<string[]>([]);
  if (!sameSeats(added, members.memberKeys)) {
    const joining = members.memberKeys.filter(key => !added.includes(key));
    setAdded(members.memberKeys);
    setChange(current => reoffer(current, offered, joining));
  }
  const { accountId, isConnected } = useHederaSigner();
  const { setDraft, preview, submitStatus } = useProposalWizard();

  // Until every row is an account with a seat, or says it adds nothing, the change is held back.
  const result = useMemo(
    () => (members.settled ? draftCouncilChange(config.governanceAccountId, change, council.key) : NO_DRAFT),
    [members.settled, config.governanceAccountId, change, council.key],
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
  const viewer = naming.proposers.find(proposer => proposer.accountId === accountId);
  const risk = councilRiskOf(change, council.key, viewer?.key ?? null);
  const agentTicked = agentSeat !== null && change.memberKeys.includes(agentSeat);
  const seats = change.memberKeys.length;
  const addedNames = Object.fromEntries(
    members.rows.flatMap(row => (row.status === "found" ? [[row.seat, { name: row.accountId }]] : [])),
  );
  const seatNaming: SeatNaming = { ...naming, memberNames: { ...naming.memberNames, ...addedNames } };

  const updateRow = (id: number, input: string) =>
    setRows(current => current.map(row => (row.id === id ? { ...row, input } : row)));
  const removeRow = (id: number) => setRows(current => current.filter(row => row.id !== id));
  const addRow = () => {
    const id = nextRowId.current;
    nextRowId.current += 1;
    setRows(current => [...current, { id, input: "" }]);
  };

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
            const seat = councilSeatOf(seatKey, seatNaming);
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

        {rows.length > 0 && (
          <ol aria-label={SETTINGS_COPY.composer.members.legend} className="m-0 flex list-none flex-col gap-2 p-0">
            {rows.map((row, index) => {
              const status = rowStatusText(index + 1, memberInputs[index], members.rows[index], reads[index]);
              return (
                <li key={row.id} className="flex flex-col gap-1">
                  <div className="flex items-end gap-2">
                    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="text-sm font-semibold">
                        {SETTINGS_COPY.composer.members.memberLabel(index + 1)}
                      </span>
                      <HederaAddressInput
                        value={row.input}
                        onChange={input => updateRow(row.id, input)}
                        placeholder="0.0.x or 0x…"
                        chainId={targetNetwork.id}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-ghost btn-square"
                      aria-label={SETTINGS_COPY.composer.members.removeMember(index + 1)}
                      onClick={() => removeRow(row.id)}
                    >
                      <XMarkIcon className="size-4" />
                    </button>
                  </div>
                  {status && (
                    <span role="status" className="text-sm text-base-content/60">
                      {status}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {unseatedAgent?.check.status === "invalid" && (
          <p role="status" className="m-0 text-sm text-base-content/60">
            {unseatedAgent.check.message}
          </p>
        )}
        <button type="button" className="btn btn-outline btn-sm self-start" onClick={addRow}>
          {SETTINGS_COPY.composer.members.addMember}
        </button>

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
