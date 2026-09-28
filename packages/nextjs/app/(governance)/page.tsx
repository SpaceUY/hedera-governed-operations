"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { partitionProposals } from "@sh/core/governance/proposals";
import { useGovernanceConfig } from "~~/components/governance/GovernanceProvider";
import { OperationCard } from "~~/components/governance/rail/OperationCard";
import { PendingOperationsList } from "~~/components/governance/rail/PendingOperationsList";
import { ProposalDetail } from "~~/components/governance/rail/ProposalDetail";
import { ScheduleSearch } from "~~/components/governance/rail/ScheduleSearch";
import { useSelectedSchedule } from "~~/components/governance/rail/useSelectedSchedule";
import { GOVERNANCE_ROUTES } from "~~/config/governanceConfig";
import { useProposals } from "~~/hooks/mirror/useProposals";
import { INBOX_COPY } from "~~/services/governance/proposalLabels";

export default function GovernanceHomePage() {
  const config = useGovernanceConfig();
  const { network, governanceAccountId, executor } = config;
  const executorContractId = executor.hederaContractId;
  const { inbox } = useProposals({ governanceAccountId, executorContractId, network });
  const { pending, settled } = partitionProposals(inbox.data?.proposals ?? []);
  const { selectedScheduleId, select } = useSelectedSchedule();

  // First impression should show something selected rather than an empty rail: the newest pending
  // proposal, unless the URL already names one (a reload, a shared link, or a search result). Only
  // once per visit, so closing the open card leaves the list as it is instead of reopening the first.
  const firstPendingId = pending[0]?.schedule.schedule_id ?? null;
  const initialSelectionDone = useRef(false);
  useEffect(() => {
    if (initialSelectionDone.current) return;
    if (selectedScheduleId) {
      initialSelectionDone.current = true;
      return;
    }
    if (!firstPendingId) return;
    initialSelectionDone.current = true;
    select(firstPendingId);
  }, [selectedScheduleId, firstPendingId, select]);

  const toggle = (scheduleId: string) => select(scheduleId === selectedScheduleId ? null : scheduleId);

  const knownScheduleIds = new Set(inbox.data?.proposals.map(proposal => proposal.schedule.schedule_id) ?? []);
  const selectedDetail = selectedScheduleId ? (
    <ProposalDetail config={config} scheduleId={selectedScheduleId} variant="inline" />
  ) : null;
  // A schedule the inbox does not list (found by the search, or named by a link) has no card in either
  // list, so the search shows it as its result, with its detail under that card.
  const unlistedSelectionId =
    inbox.data && selectedScheduleId && !knownScheduleIds.has(selectedScheduleId) ? selectedScheduleId : null;

  return (
    <div className="flex flex-col gap-4 px-6 py-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="m-0 text-lg font-bold">{INBOX_COPY.pendingHeading}</h1>
        <Link href={GOVERNANCE_ROUTES.newProposal} className="btn btn-primary btn-sm">
          New proposal
        </Link>
      </div>

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
        <p role="status" className="m-0 text-sm text-warning">
          This list may be incomplete: proposals from {inbox.data.unreachableProposers.join(", ")} could not be read.
        </p>
      )}
      {!inbox.data && <span className="loading loading-spinner loading-sm" aria-label="Loading proposals" />}
      {inbox.data && pending.length === 0 && <p className="m-0 text-sm text-base-content/60">{INBOX_COPY.noPending}</p>}
      {pending.length > 0 && (
        <PendingOperationsList
          proposals={pending}
          selectedScheduleId={selectedScheduleId}
          onSelect={toggle}
          selectedDetail={selectedDetail}
        />
      )}

      {settled.length > 0 && (
        <section aria-labelledby="settled-proposals" className="flex flex-col gap-2 border-t border-base-300 pt-4">
          <h2 id="settled-proposals" className="m-0 text-sm font-semibold text-base-content/70">
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
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
