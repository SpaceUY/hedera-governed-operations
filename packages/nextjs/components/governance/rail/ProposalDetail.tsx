"use client";

import { type HeadingLevel, ProposalDetailPanel } from "./ProposalDetailPanel";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { useProposalLookup } from "~~/hooks/mirror/useProposalLookup";
import { useHederaSigner } from "~~/hooks/useHederaSigner";

export type ProposalDetailProps = {
  config: GovernanceConfig;
  scheduleId: string;
  headingLevel?: HeadingLevel;
};

/**
 * One proposal by schedule id: owns the reads and hands the result to `ProposalDetailPanel`. The detail
 * route mounts it as the whole rail; the home page mounts it under the selected card, one heading
 * level down, so both show the same thing.
 */
export const ProposalDetail = ({
  config: { governanceAccountId, executor, network },
  scheduleId,
  headingLevel,
}: ProposalDetailProps) => {
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
      headingLevel={headingLevel}
    />
  );
};
