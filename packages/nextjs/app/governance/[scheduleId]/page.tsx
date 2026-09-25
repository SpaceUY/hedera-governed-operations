"use client";

import { useParams } from "next/navigation";
import { getDeployedContract, getGovernanceEntityIds } from "~~/config/governanceConfig";
import { useProposalLookup } from "~~/hooks/mirror/useProposalLookup";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { useCancelProposal } from "~~/hooks/useCancelProposal";
import { useSignProposal } from "~~/hooks/useSignProposal";
import { useWithdrawProposal } from "~~/hooks/useWithdrawProposal";
import { describeRegistryOperation, describeScheduledOperation } from "~~/services/governance/proposalTypes";

export default function ProposalDetailPage() {
  const params = useParams<{ scheduleId: string }>();
  const { targetNetwork } = useTargetNetwork();
  const executor = getDeployedContract(targetNetwork.id, "GovernedExecutor");
  const { governanceAccountId } = getGovernanceEntityIds();

  const { proposal, isLoading, error } = useProposalLookup({
    governanceAccountId,
    executorContractId: executor.hederaContractId!,
    scheduleId: params.scheduleId,
  });
  const sign = useSignProposal();
  const withdraw = useWithdrawProposal();
  const cancel = useCancelProposal();

  if (isLoading) return <span className="loading loading-spinner loading-lg" aria-label="Loading proposal" />;
  if (error) return <p className="text-error">{error.message}</p>;
  if (!proposal) return <p>Proposal not found.</p>;

  const registryDescription =
    proposal.registry.status === "read" ? describeRegistryOperation(proposal.registry.entry.operation) : null;
  const cancellableProposalId =
    proposal.registry.status === "read" && proposal.registry.entry.state === "pending"
      ? proposal.registry.entry.proposalId
      : null;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-bold mb-4">Proposal {proposal.schedule.schedule_id}</h1>
      <p className="mb-2">{describeScheduledOperation(proposal.operation)}</p>
      {registryDescription && <p className="mb-4 text-base-content/70">{registryDescription}</p>}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm mb-6">
        <dt className="text-base-content/60">Schedule status</dt>
        <dd>{proposal.state.status}</dd>
        <dt className="text-base-content/60">Registry</dt>
        <dd>{proposal.registry.status === "read" ? proposal.registry.entry.state : proposal.registry.status}</dd>
        <dt className="text-base-content/60">Approvals</dt>
        <dd>
          {proposal.progress.signed} of {proposal.progress.threshold} outgoing
          {proposal.incomingProgress
            ? ` · ${proposal.incomingProgress.signed} of ${proposal.incomingProgress.threshold} incoming`
            : ""}
        </dd>
      </dl>

      {proposal.state.status === "pending" && (
        <div className="flex gap-2 mb-4">
          <button
            className="btn btn-primary"
            onClick={() => sign.mutate(proposal.schedule.schedule_id)}
            disabled={sign.isPending}
          >
            Sign
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => withdraw.mutate(proposal.schedule.schedule_id)}
            disabled={withdraw.isPending}
          >
            Withdraw my approval round
          </button>
        </div>
      )}

      {cancellableProposalId != null && (
        <button
          className="btn btn-error btn-outline"
          onClick={() =>
            cancel.mutate({ executorContractId: executor.hederaContractId!, registryProposalId: cancellableProposalId })
          }
          disabled={cancel.isPending}
        >
          Cancel this proposal
        </button>
      )}
    </div>
  );
}
