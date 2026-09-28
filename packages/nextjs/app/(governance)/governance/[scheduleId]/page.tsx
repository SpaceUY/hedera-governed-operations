"use client";

import { useParams } from "next/navigation";
import { DemoSignButtons } from "~~/components/governance/DemoSignButtons";
import { useGovernanceConfig } from "~~/components/governance/GovernanceProvider";
import { MutationError } from "~~/components/governance/MutationError";
import { useProposalLookup } from "~~/hooks/mirror/useProposalLookup";
import { useCancelProposal } from "~~/hooks/useCancelProposal";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { useSignProposal } from "~~/hooks/useSignProposal";
import { useWithdrawProposal } from "~~/hooks/useWithdrawProposal";
import { canBeSigned, canBeWithdrawnBy, cancellableRegistryId } from "~~/services/governance/proposalActions";
import {
  approvalsLabel,
  executionFailureLabel,
  proposalStatusLabel,
  registryLabel,
} from "~~/services/governance/proposalLabels";
import { describeRegistryOperation, describeScheduledOperation } from "~~/services/governance/proposalTypes";
import { formatTinybars } from "~~/utils/scaffold-hbar/hbarAmount";

type ProposalDetailProps = { governanceAccountId: string; executorContractId: string; scheduleId: string };

export default function ProposalDetailPage() {
  const params = useParams<{ scheduleId: string }>();
  const { governanceAccountId, executor } = useGovernanceConfig();
  return (
    <ProposalDetail
      governanceAccountId={governanceAccountId}
      executorContractId={executor.hederaContractId}
      scheduleId={params.scheduleId}
    />
  );
}

function ProposalDetail({ governanceAccountId, executorContractId, scheduleId }: ProposalDetailProps) {
  const { proposal, isLoading, error, refresh } = useProposalLookup({
    governanceAccountId,
    executorContractId,
    scheduleId,
  });
  const { accountId } = useHederaSigner();
  const sign = useSignProposal();
  const withdraw = useWithdrawProposal();
  const cancel = useCancelProposal();

  if (isLoading) return <span className="loading loading-spinner loading-lg" aria-label="Loading proposal" />;
  if (error) return <p className="text-error">{error.message}</p>;
  if (!proposal) return <p>Proposal not found.</p>;

  const { operation, registry } = proposal;
  const registryDescription = registry.status === "read" ? describeRegistryOperation(registry.entry.operation) : null;
  const isPending = proposal.state.status === "pending";
  const isWithdrawable = canBeWithdrawnBy(proposal, accountId);
  const cancellableProposalId = cancellableRegistryId(proposal);
  const executionFailure = executionFailureLabel(proposal);

  return (
    <div className="px-6 py-5">
      <h1 className="text-lg font-bold mb-4">Proposal {proposal.schedule.schedule_id}</h1>
      <p className="mb-2">{describeScheduledOperation(operation)}</p>
      {registryDescription && <p className="mb-4 text-base-content/70">{registryDescription}</p>}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm mb-6">
        <dt className="text-base-content/60">Status</dt>
        <dd>{proposalStatusLabel(proposal)}</dd>
        <dt className="text-base-content/60">Registry entry</dt>
        <dd>{registryLabel(registry)}</dd>
        {operation.kind === "registryCall" && (
          <>
            {operation.payableTinybars > 0n && (
              <>
                <dt className="text-base-content/60">HBAR sent by the treasury</dt>
                <dd>{formatTinybars(operation.payableTinybars)}</dd>
              </>
            )}
            <dt className="text-base-content/60">Gas limit (paid in full by the treasury)</dt>
            <dd>{operation.gas.toLocaleString()}</dd>
          </>
        )}
        <dt className="text-base-content/60">Approvals</dt>
        <dd>{approvalsLabel(proposal.progress, proposal.incomingProgress)}</dd>
      </dl>

      {executionFailure && <p className="text-sm text-error mb-6">{executionFailure}</p>}

      {isPending && (
        <div className="text-sm text-base-content/70 mb-6 flex flex-col gap-1">
          <p>
            The network runs the operation as soon as the threshold is reached.{" "}
            {proposal.state.expiresAt
              ? `If it isn't reached by ${proposal.state.expiresAt.toLocaleString()}, the proposal expires and nothing runs.`
              : "If it isn't reached before the schedule expires, nothing runs."}
          </p>
          {proposal.incomingProgress && (
            <p>
              Replacing the council needs signatures from both sides: the current council&apos;s threshold and the
              incoming council&apos;s own.
            </p>
          )}
        </div>
      )}

      {isPending && (
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex gap-2">
            {canBeSigned(proposal) && (
              <button
                className="btn btn-primary"
                onClick={() => sign.mutate(proposal.schedule.schedule_id, { onSuccess: refresh })}
                disabled={sign.isPending}
              >
                Sign
              </button>
            )}
            {isWithdrawable && (
              <button
                className="btn btn-ghost"
                onClick={() => withdraw.mutate(proposal.schedule.schedule_id, { onSuccess: refresh })}
                disabled={withdraw.isPending}
              >
                Withdraw this proposal
              </button>
            )}
          </div>
          <MutationError error={sign.error} />
          <MutationError error={withdraw.error} />
          <DemoSignButtons
            proposal={proposal}
            governanceAccountId={governanceAccountId}
            executorContractId={executorContractId}
            onSigned={refresh}
          />
          {isWithdrawable && (
            <p className="text-sm text-base-content/60">
              Withdrawing deletes the schedule and every approval on it; only you, as the proposer, can do it.
              {operation.kind === "registryCall" && " Cancelling the registry entry becomes available afterwards."}
            </p>
          )}
        </div>
      )}

      {cancellableProposalId != null && (
        <div className="flex flex-col gap-2">
          <button
            className="btn btn-error btn-outline self-start"
            onClick={() =>
              cancel.mutate({ executorContractId, registryProposalId: cancellableProposalId }, { onSuccess: refresh })
            }
            disabled={cancel.isPending}
          >
            Cancel this proposal
          </button>
          <MutationError error={cancel.error} />
        </div>
      )}
    </div>
  );
}
