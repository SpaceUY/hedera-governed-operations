"use client";

import { useEffect } from "react";
import Link from "next/link";
import { partitionProposals } from "@sh/core/governance/proposals";
import { useGovernanceConfig } from "~~/components/governance/GovernanceProvider";
import { OperationCard } from "~~/components/governance/rail/OperationCard";
import { PendingOperationsList } from "~~/components/governance/rail/PendingOperationsList";
import { ScheduleSearch } from "~~/components/governance/rail/ScheduleSearch";
import { useSelectedSchedule } from "~~/components/governance/rail/useSelectedSchedule";
import { GOVERNANCE_ROUTES } from "~~/config/governanceConfig";
import { useProposals } from "~~/hooks/mirror/useProposals";
import { INBOX_COPY } from "~~/services/governance/proposalLabels";

export default function GovernanceHomePage() {
  const { network, governanceAccountId, executor } = useGovernanceConfig();
  const executorContractId = executor.hederaContractId;
  const { inbox } = useProposals({ governanceAccountId, executorContractId, network });
  const { pending, settled } = partitionProposals(inbox.data?.proposals ?? []);
  const { selectedScheduleId, select } = useSelectedSchedule();

  // First impression should show something selected rather than an empty rail: the newest pending
  // proposal, unless the URL already names one (a reload, a shared link, or a search result).
  const firstPendingId = pending[0]?.schedule.schedule_id ?? null;
  useEffect(() => {
    if (selectedScheduleId || !firstPendingId) return;
    select(firstPendingId);
  }, [selectedScheduleId, firstPendingId, select]);

  const knownScheduleIds = new Set(inbox.data?.proposals.map(proposal => proposal.schedule.schedule_id) ?? []);

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
        <PendingOperationsList proposals={pending} selectedScheduleId={selectedScheduleId} onSelect={select} />
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
                onSelect={() => select(proposal.schedule.schedule_id)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
