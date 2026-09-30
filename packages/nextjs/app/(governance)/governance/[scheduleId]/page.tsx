"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useGovernanceConfig } from "~~/components/governance/GovernanceProvider";
import { ProposalDetail } from "~~/components/governance/rail/ProposalDetail";
import { GOVERNANCE_ROUTES } from "~~/config/governanceConfig";

export default function ProposalDetailPage() {
  const params = useParams<{ scheduleId: string }>();
  const config = useGovernanceConfig();
  return (
    <div className="flex flex-col">
      <div className="flex items-center px-6 pt-4">
        {/* Back to the list with this proposal's card open, the way it reads on the map. */}
        <Link
          href={GOVERNANCE_ROUTES.selected(params.scheduleId)}
          className="btn btn-outline btn-sm"
          aria-label="Back to the map"
        >
          ← Map
        </Link>
      </div>
      <ProposalDetail config={config} scheduleId={params.scheduleId} />
    </div>
  );
}
