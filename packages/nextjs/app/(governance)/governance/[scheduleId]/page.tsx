"use client";

import { useParams } from "next/navigation";
import { useGovernanceConfig } from "~~/components/governance/GovernanceProvider";
import { ProposalDetailPanel } from "~~/components/governance/rail/ProposalDetailPanel";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { useProposalLookup } from "~~/hooks/mirror/useProposalLookup";
import { useHederaSigner } from "~~/hooks/useHederaSigner";

type ProposalDetailProps = { config: GovernanceConfig; scheduleId: string };

export default function ProposalDetailPage() {
  const params = useParams<{ scheduleId: string }>();
  const config = useGovernanceConfig();
  return <ProposalDetail config={config} scheduleId={params.scheduleId} />;
}

function ProposalDetail({ config: { governanceAccountId, executor, network }, scheduleId }: ProposalDetailProps) {
  const executorContractId = executor.hederaContractId;
  const { proposal, isLoading, error, refresh, markRegistryEntryCancelled } = useProposalLookup({
    governanceAccountId,
    executorContractId,
    network,
    scheduleId,
  });
  const { accountId } = useHederaSigner();

  if (isLoading) return <span className="loading loading-spinner loading-lg" aria-label="Loading proposal" />;
  if (error) return <p className="text-error">{error.message}</p>;
  if (!proposal) return <p>Proposal not found.</p>;

  return (
    <ProposalDetailPanel
      proposal={proposal}
      accountId={accountId}
      governanceAccountId={governanceAccountId}
      executorContractId={executorContractId}
      network={network}
      refresh={refresh}
      markRegistryEntryCancelled={markRegistryEntryCancelled}
    />
  );
}
