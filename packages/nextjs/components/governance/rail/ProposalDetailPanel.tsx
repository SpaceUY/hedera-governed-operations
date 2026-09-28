"use client";

import { ApproverList } from "./ApproverList";
import { WithdrawCancelActions } from "./WithdrawCancelActions";
import { describeRegistryOperation, describeScheduledOperation } from "@sh/core/governance/proposalTypes";
import type { Proposal } from "@sh/core/governance/proposals";
import { MutationError } from "~~/components/governance/MutationError";
import { useCouncil } from "~~/hooks/mirror/useCouncil";
import { useSignProposal } from "~~/hooks/useSignProposal";
import { canBeSigned } from "~~/services/governance/proposalActions";
import {
  LIVE_MAP_STATUS_NOTE,
  approvalsLabel,
  executionFailureLabel,
  proposalStatusLabel,
  registryLabel,
} from "~~/services/governance/proposalLabels";
import { formatTinybars } from "~~/utils/scaffold-hbar/hbarAmount";

export type ProposalDetailPanelProps = {
  proposal: Proposal;
  accountId: string | null;
  governanceAccountId: string;
  executorContractId: string;
  network: string;
  /** Re-reads the schedule and, for a registry call, its entry — after Sign or Withdraw. */
  refresh: () => void;
  /** After Cancel: marks the entry cancelled without waiting on the relay. See `useProposalLookup`. */
  markRegistryEntryCancelled: () => void;
};

/**
 * The body of `/governance/[scheduleId]`, lifted out of the route so a rail selection elsewhere (a
 * future host on `/`) can mount the same presentation. The route stays the thin owner of the reads:
 * this component only renders what it is handed and the actions that mutate it.
 */
export const ProposalDetailPanel = ({
  proposal,
  accountId,
  governanceAccountId,
  executorContractId,
  network,
  refresh,
  markRegistryEntryCancelled,
}: ProposalDetailPanelProps) => {
  const { operation, registry } = proposal;
  const registryDescription = registry.status === "read" ? describeRegistryOperation(registry.entry.operation) : null;
  const isPending = proposal.state.status === "pending";
  const executionFailure = executionFailureLabel(proposal);
  const sign = useSignProposal();
  const council = useCouncil({ governanceAccountId, executorContractId, network });

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

      {council.data && (
        <div className="flex flex-col gap-4 mb-6">
          {operation.kind === "councilRotation" && proposal.incomingProgress ? (
            <>
              <ApproverList
                heading="Current council"
                council={council.data.key}
                progress={proposal.progress}
                proposers={council.data.proposers}
                viewerAccountId={accountId}
              />
              <ApproverList
                heading="Incoming council"
                council={operation.council}
                progress={proposal.incomingProgress}
                proposers={council.data.proposers}
                viewerAccountId={accountId}
              />
            </>
          ) : (
            <ApproverList
              heading="Approvals"
              council={council.data.key}
              progress={proposal.progress}
              proposers={council.data.proposers}
              viewerAccountId={accountId}
            />
          )}
        </div>
      )}

      {executionFailure && <p className="text-sm text-error mb-6">{executionFailure}</p>}

      {isPending && (
        <div className="text-sm text-base-content/70 mb-6 flex flex-col gap-1">
          <p>{LIVE_MAP_STATUS_NOTE}</p>
          {proposal.state.expiresAt && (
            <p>
              If the threshold isn&apos;t reached by {proposal.state.expiresAt.toLocaleString()}, the proposal expires
              and nothing runs.
            </p>
          )}
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
          {canBeSigned(proposal) && (
            <div className="flex gap-2">
              <button
                className="btn btn-primary"
                onClick={() => sign.mutate(proposal.schedule.schedule_id, { onSuccess: refresh })}
                disabled={sign.isPending}
              >
                Sign
              </button>
            </div>
          )}
          <MutationError error={sign.error} />
        </div>
      )}

      <WithdrawCancelActions
        proposal={proposal}
        accountId={accountId}
        executorContractId={executorContractId}
        governanceAccountId={governanceAccountId}
        onWithdrawn={refresh}
        onCancelled={markRegistryEntryCancelled}
      />
    </div>
  );
};
