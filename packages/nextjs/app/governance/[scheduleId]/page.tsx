"use client";

import { useParams } from "next/navigation";
import { Hbar } from "@hiero-ledger/sdk";
import { SetupNotice } from "~~/components/SetupNotice";
import { getDeployedContract, getGovernanceEntityIds } from "~~/config/governanceConfig";
import { useProposalLookup } from "~~/hooks/mirror/useProposalLookup";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { useCancelProposal } from "~~/hooks/useCancelProposal";
import { useSignProposal } from "~~/hooks/useSignProposal";
import { useWithdrawProposal } from "~~/hooks/useWithdrawProposal";
import { describeRegistryOperation, describeScheduledOperation } from "~~/services/governance/proposalTypes";
import type { Proposal } from "~~/services/governance/proposals";
import { isWalletRejection } from "~~/services/web3/hederaSigner";

const REJECTED_MESSAGE = "Request rejected in the wallet.";

const toFriendlyMessage = (error: unknown) =>
  isWalletRejection(error)
    ? REJECTED_MESSAGE
    : `Transaction failed: ${error instanceof Error ? error.message : "unknown error"}`;

const MutationError = ({ error }: { error: unknown }) =>
  error ? (
    <p role="alert" className="text-sm text-error">
      {toFriendlyMessage(error)}
    </p>
  ) : null;

/**
 * A council member is only asked to sign a proposal the app can vouch for: a native kind (no
 * registry entry), or a registry call whose entry is still pending and decodes to an operation this
 * template knows. A missing, cancelled, unreadable or unrecognised entry gets no Sign button.
 */
function canBeSigned({ state, operation, registry }: Proposal): boolean {
  if (state.status !== "pending") return false;
  if (operation.kind === "treasuryTransfer" || operation.kind === "councilRotation") {
    return registry.status === "notApplicable";
  }
  if (operation.kind !== "registryCall") return false;
  return (
    registry.status === "read" && registry.entry.state === "pending" && registry.entry.operation.kind !== "unrecognized"
  );
}

type ProposalDetailProps = { governanceAccountId: string; executorContractId: string; scheduleId: string };

export default function ProposalDetailPage() {
  const params = useParams<{ scheduleId: string }>();
  const { targetNetwork } = useTargetNetwork();
  let props: ProposalDetailProps;
  try {
    props = {
      governanceAccountId: getGovernanceEntityIds().governanceAccountId,
      executorContractId: getDeployedContract(targetNetwork.id, "GovernedExecutor").hederaContractId,
      scheduleId: params.scheduleId,
    };
  } catch (error) {
    return <SetupNotice error={error} />;
  }
  return <ProposalDetail {...props} />;
}

function ProposalDetail({ governanceAccountId, executorContractId, scheduleId }: ProposalDetailProps) {
  const { proposal, isLoading, error, refresh } = useProposalLookup({
    governanceAccountId,
    executorContractId,
    scheduleId,
  });
  const sign = useSignProposal();
  const withdraw = useWithdrawProposal();
  const cancel = useCancelProposal();

  if (isLoading) return <span className="loading loading-spinner loading-lg" aria-label="Loading proposal" />;
  if (error) return <p className="text-error">{error.message}</p>;
  if (!proposal) return <p>Proposal not found.</p>;

  const { operation, registry } = proposal;
  const registryDescription = registry.status === "read" ? describeRegistryOperation(registry.entry.operation) : null;
  const isPending = proposal.state.status === "pending";
  // Cancel only once the schedule is gone without running: deleting a live schedule comes first, or
  // it could still reach threshold on a cancelled entry and charge the governance account the gas.
  const cancellableProposalId =
    registry.status === "read" &&
    registry.entry.state === "pending" &&
    (proposal.state.status === "deleted" || proposal.state.status === "expired")
      ? registry.entry.proposalId
      : null;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-bold mb-4">Proposal {proposal.schedule.schedule_id}</h1>
      <p className="mb-2">{describeScheduledOperation(operation)}</p>
      {registryDescription && <p className="mb-4 text-base-content/70">{registryDescription}</p>}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm mb-6">
        <dt className="text-base-content/60">Schedule status</dt>
        <dd>{proposal.state.status}</dd>
        <dt className="text-base-content/60">Registry</dt>
        <dd>{registry.status === "read" ? registry.entry.state : registry.status}</dd>
        {operation.kind === "registryCall" && (
          <>
            {operation.payableTinybars > 0n && (
              <>
                <dt className="text-base-content/60">HBAR sent by the treasury</dt>
                <dd>{Hbar.fromTinybars(operation.payableTinybars.toString()).toString()}</dd>
              </>
            )}
            <dt className="text-base-content/60">Gas limit (paid in full by the treasury)</dt>
            <dd>{operation.gas.toLocaleString()}</dd>
          </>
        )}
        <dt className="text-base-content/60">Approvals</dt>
        <dd>
          {proposal.progress.signed} of {proposal.progress.threshold} outgoing
          {proposal.incomingProgress
            ? ` · ${proposal.incomingProgress.signed} of ${proposal.incomingProgress.threshold} incoming`
            : ""}
        </dd>
      </dl>

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
            <button
              className="btn btn-ghost"
              onClick={() => withdraw.mutate(proposal.schedule.schedule_id, { onSuccess: refresh })}
              disabled={withdraw.isPending}
            >
              Withdraw this proposal
            </button>
          </div>
          <MutationError error={sign.error} />
          <MutationError error={withdraw.error} />
          <p className="text-sm text-base-content/60">
            Withdrawing deletes the schedule and every approval on it; only the proposer can do it.
            {operation.kind === "registryCall" && " Cancelling the registry entry becomes available afterwards."}
          </p>
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
