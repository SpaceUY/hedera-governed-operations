"use client";

import Link from "next/link";
import { describeScheduledOperation } from "@sh/core/governance/proposalTypes";
import { type Proposal, partitionProposals } from "@sh/core/governance/proposals";
import { useGovernanceConfig } from "~~/components/governance/GovernanceProvider";
import { GOVERNANCE_ROUTES } from "~~/config/governanceConfig";
import { useProposals } from "~~/hooks/mirror/useProposals";
import { INBOX_COPY, approvalsLabel, proposalStatusLabel } from "~~/services/governance/proposalLabels";

const ProposalLinks = ({ proposals }: { proposals: Proposal[] }) => (
  <ul className="m-0 flex list-none flex-col gap-2 p-0">
    {proposals.map(proposal => (
      <li key={proposal.schedule.schedule_id}>
        <Link href={GOVERNANCE_ROUTES.proposal(proposal.schedule.schedule_id)} className="link link-primary">
          {describeScheduledOperation(proposal.operation)} — {proposalStatusLabel(proposal)} —{" "}
          {approvalsLabel(proposal.progress, proposal.incomingProgress)}
        </Link>
      </li>
    ))}
  </ul>
);

export default function GovernanceHomePage() {
  const { network, governanceAccountId, executor } = useGovernanceConfig();
  const { inbox } = useProposals({ governanceAccountId, executorContractId: executor.hederaContractId, network });
  const { pending, settled } = partitionProposals(inbox.data?.proposals ?? []);

  return (
    <div className="flex flex-col gap-4 px-6 py-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="m-0 text-lg font-bold">{INBOX_COPY.pendingHeading}</h1>
        <Link href={GOVERNANCE_ROUTES.newProposal} className="btn btn-primary btn-sm">
          New proposal
        </Link>
      </div>
      {inbox.data && inbox.data.unreachableProposers.length > 0 && (
        <p role="status" className="m-0 text-sm text-warning">
          This list may be incomplete: proposals from {inbox.data.unreachableProposers.join(", ")} could not be read.
        </p>
      )}
      {!inbox.data && <span className="loading loading-spinner loading-sm" aria-label="Loading proposals" />}
      {inbox.data && pending.length === 0 && <p className="m-0 text-sm text-base-content/60">{INBOX_COPY.noPending}</p>}
      {pending.length > 0 && <ProposalLinks proposals={pending} />}

      {settled.length > 0 && (
        <section aria-labelledby="settled-proposals" className="flex flex-col gap-2 border-t border-base-300 pt-4">
          <h2 id="settled-proposals" className="m-0 text-sm font-semibold text-base-content/70">
            {INBOX_COPY.settledHeading}
          </h2>
          <ProposalLinks proposals={settled} />
        </section>
      )}
    </div>
  );
}
