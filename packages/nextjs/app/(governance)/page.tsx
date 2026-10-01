"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { type Proposal, partitionProposals } from "@sh/core/governance/proposals";
import { useGovernanceConfig } from "~~/components/governance/GovernanceProvider";
import { useMapPlayback, useShownProposals } from "~~/components/governance/MapPlaybackProvider";
import { OperationCard } from "~~/components/governance/rail/OperationCard";
import { PendingOperationsList } from "~~/components/governance/rail/PendingOperationsList";
import { ProposalDetail } from "~~/components/governance/rail/ProposalDetail";
import { ScheduleSearch } from "~~/components/governance/rail/ScheduleSearch";
import { pendingSummaryLabel } from "~~/components/governance/rail/pendingCollapse";
import { cardPlaceOf, useRefocusMovedCard } from "~~/components/governance/rail/useRefocusMovedCard";
import { useSelectedSchedule } from "~~/components/governance/rail/useSelectedSchedule";
import { GOVERNANCE_ROUTES } from "~~/config/governanceConfig";
import { useProposals } from "~~/hooks/mirror/useProposals";
import { INBOX_COPY, councilRuleLabel, runsByItselfNote } from "~~/services/governance/proposalLabels";

const NO_PROPOSALS: Proposal[] = [];

export default function GovernanceHomePage() {
  const config = useGovernanceConfig();
  const { network, governanceAccountId, executor } = config;
  const executorContractId = executor.hederaContractId;
  const { inbox, council } = useProposals({ governanceAccountId, executorContractId, network });
  // A proposal the map is still playing stays where the map shows it (in Pending, until its run lands).
  const shown = useShownProposals(inbox.data?.proposals ?? NO_PROPOSALS);
  const { busy } = useMapPlayback();
  const { pending, settled } = partitionProposals(shown);
  const { selectedScheduleId, select } = useSelectedSchedule();
  useRefocusMovedCard(selectedScheduleId, cardPlaceOf(selectedScheduleId, inbox.data ? { pending, settled } : null));

  // First impression should show something selected rather than an empty rail: the newest pending
  // proposal, unless the URL already names one (a reload, a shared link, or a search result). Decided
  // once, on the first inbox read: closing the open card does not reopen the first, and a proposal
  // that turns up later, after a first read with none pending, does not open by itself mid-visit.
  const firstPendingId = pending[0]?.schedule.schedule_id ?? null;
  const hasInbox = inbox.data !== undefined;
  const initialSelectionDone = useRef(false);
  useEffect(() => {
    if (initialSelectionDone.current || !hasInbox) return;
    initialSelectionDone.current = true;
    if (!selectedScheduleId && firstPendingId) select(firstPendingId);
  }, [hasInbox, selectedScheduleId, firstPendingId, select]);

  const toggle = (scheduleId: string) => select(scheduleId === selectedScheduleId ? null : scheduleId);

  const knownScheduleIds = new Set(inbox.data?.proposals.map(proposal => proposal.schedule.schedule_id) ?? []);
  const selectedDetail = selectedScheduleId ? (
    <ProposalDetail config={config} scheduleId={selectedScheduleId} variant="inline" />
  ) : null;
  // A schedule the inbox does not list (found by the search, or named by a link) has no card in either
  // list, so the search shows it as its result, with its detail under that card.
  const unlistedSelectionId =
    inbox.data && selectedScheduleId && !knownScheduleIds.has(selectedScheduleId) ? selectedScheduleId : null;
  const note = runsByItselfNote(council.data ? councilRuleLabel(council.data.key) : null);

  return (
    <div className="flex flex-col gap-4 px-6 py-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="m-0 text-base font-bold">{INBOX_COPY.pendingHeading}</h1>
          {inbox.data && (
            <span className="chip" aria-label={pendingSummaryLabel(pending.length)}>
              {pending.length}
            </span>
          )}
        </div>
        <Link href={GOVERNANCE_ROUTES.newProposal} className="btn btn-primary btn-sm">
          New proposal
        </Link>
      </div>
      <p className="m-0 text-sm text-base-content/60">
        {note.lead}
        <b className="font-semibold text-base-content">{note.council}</b>
        {note.rest}
      </p>

      <ScheduleSearch
        governanceAccountId={governanceAccountId}
        executorContractId={executorContractId}
        network={network}
        selectedScheduleId={selectedScheduleId}
        onSelect={select}
        onToggle={toggle}
        unlistedSelectionId={unlistedSelectionId}
        selectedDetail={selectedDetail}
        knownScheduleIds={knownScheduleIds}
      />

      {inbox.data && inbox.data.unreachableProposers.length > 0 && (
        <p role="status" className="m-0 text-sm text-warning-ink">
          This list may be incomplete: proposals from {inbox.data.unreachableProposers.join(", ")} could not be read.
        </p>
      )}
      {!inbox.data && (
        <div role="status" aria-label={INBOX_COPY.loading} className="flex flex-col gap-2">
          <div className="skeleton h-16 rounded-box" />
          <div className="skeleton h-16 rounded-box" />
        </div>
      )}
      {inbox.data && pending.length === 0 && <p className="m-0 text-sm text-base-content/60">{INBOX_COPY.noPending}</p>}
      {pending.length > 0 && (
        <PendingOperationsList
          proposals={pending}
          selectedScheduleId={selectedScheduleId}
          onSelect={toggle}
          selectedDetail={selectedDetail}
          confirmingScheduleIds={busy}
        />
      )}

      {settled.length > 0 && (
        <section aria-labelledby="recent-proposals" className="flex flex-col gap-2 border-t border-base-300 pt-4">
          <h2 id="recent-proposals" className="m-0 text-base font-bold">
            {INBOX_COPY.settledHeading}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {settled.map(proposal => (
              <OperationCard
                key={proposal.schedule.schedule_id}
                proposal={proposal}
                selected={proposal.schedule.schedule_id === selectedScheduleId}
                onSelect={() => toggle(proposal.schedule.schedule_id)}
                detail={selectedDetail}
                confirming={busy.includes(proposal.schedule.schedule_id)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
