"use client";

import { useParams } from "next/navigation";
import { useGovernanceConfig } from "~~/components/governance/GovernanceProvider";
import { ProposalDetail } from "~~/components/governance/rail/ProposalDetail";

export default function ProposalDetailPage() {
  const params = useParams<{ scheduleId: string }>();
  const config = useGovernanceConfig();
  return <ProposalDetail config={config} scheduleId={params.scheduleId} />;
}
