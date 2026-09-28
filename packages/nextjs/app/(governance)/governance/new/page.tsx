"use client";

import Link from "next/link";
import { useGovernanceConfig } from "~~/components/governance/GovernanceProvider";
import { ProposalWizard } from "~~/components/governance/wizard/ProposalWizard";
import { GOVERNANCE_ROUTES } from "~~/config/governanceConfig";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";

/** The wizard in the rail; the governance layout provides its draft and routes to the proposal once submitted. */
export default function NewProposalPage() {
  const { targetNetwork } = useTargetNetwork();
  const config = useGovernanceConfig();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-base-300">
        <Link href={GOVERNANCE_ROUTES.home} className="btn btn-outline btn-sm" aria-label="Back to the map">
          ← Map
        </Link>
        <h1 className="m-0 text-base font-bold">New proposal</h1>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <ProposalWizard config={config} chain={targetNetwork} headingLevel={2} />
      </div>
    </div>
  );
}
