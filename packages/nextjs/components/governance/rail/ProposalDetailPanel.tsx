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
  UNREACHABLE_REGISTRY_SIGN_WARNING,
  approvalsLabel,
  executionFailureLabel,
  proposalStatusLabel,
  registryLabel,
} from "~~/services/governance/proposalLabels";
import { formatTinybars } from "~~/utils/scaffold-hbar/hbarAmount";

/**
 * Where the panel sits: `page` where it is the whole rail, `inline` where it opens under a card in
 * the list on `/`. One choice sets the heading levels, the padding and the title size together, so
 * an inline panel reads one level below the page's own title and fits a phone-width column.
 */
export type PanelVariant = "page" | "inline";

const VARIANT_LAYOUT = {
  page: {
    Title: "h1",
    approverHeadingLevel: 2,
    container: "px-6 py-5",
    title: "text-lg mb-4",
    body: "",
    facts: "grid-cols-[auto_1fr] gap-x-4 gap-y-2",
  },
  // A phone-width card has no room for a label column beside the values, so each value goes under its label.
  inline: {
    Title: "h2",
    approverHeadingLevel: 3,
    container: "px-3 py-3",
    title: "text-base mb-3",
    body: "text-sm",
    facts: "grid-cols-1 gap-y-1",
  },
} as const satisfies Record<PanelVariant, object>;

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
  variant?: PanelVariant;
};

/**
 * The body of a proposal's detail, shown by `/governance/[scheduleId]` and under the selected card on
 * `/` (both through `ProposalDetail`, which owns the reads): this component only renders what it is
 * handed and the actions that mutate it.
 */
export const ProposalDetailPanel = ({
  proposal,
  accountId,
  governanceAccountId,
  executorContractId,
  network,
  refresh,
  markRegistryEntryCancelled,
  variant = "page",
}: ProposalDetailPanelProps) => {
  const { operation, registry } = proposal;
  const registryDescription = registry.status === "read" ? describeRegistryOperation(registry.entry.operation) : null;
  const isPending = proposal.state.status === "pending";
  const executionFailure = executionFailureLabel(proposal);
  const registryUnreachable = operation.kind === "registryCall" && registry.status === "unreachable";
  const sign = useSignProposal();
  const council = useCouncil({ governanceAccountId, executorContractId, network });
  const { Title, approverHeadingLevel, container, title, body, facts } = VARIANT_LAYOUT[variant];

  return (
    // Addresses and ids are single long words; letting them wrap anywhere keeps a phone from scrolling sideways.
    <div className={`${container} wrap-anywhere`}>
      <Title className={`${title} font-bold`}>Proposal {proposal.schedule.schedule_id}</Title>
      <p className={`mb-2 ${body}`}>{describeScheduledOperation(operation)}</p>
      {registryDescription && <p className={`mb-4 text-base-content/70 ${body}`}>{registryDescription}</p>}

      <dl className={`grid ${facts} text-sm mb-6`}>
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
                headingLevel={approverHeadingLevel}
              />
              <ApproverList
                heading="Incoming council"
                council={operation.council}
                progress={proposal.incomingProgress}
                proposers={council.data.proposers}
                viewerAccountId={accountId}
                headingLevel={approverHeadingLevel}
              />
            </>
          ) : (
            <ApproverList
              heading="Approvals"
              council={council.data.key}
              progress={proposal.progress}
              proposers={council.data.proposers}
              viewerAccountId={accountId}
              headingLevel={approverHeadingLevel}
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
          {registryUnreachable && (
            <p role="status" className="text-sm text-warning">
              {UNREACHABLE_REGISTRY_SIGN_WARNING}
            </p>
          )}
          <MutationError error={sign.error} />
        </div>
      )}

      <WithdrawCancelActions
        proposal={proposal}
        accountId={accountId}
        executorContractId={executorContractId}
        governanceAccountId={governanceAccountId}
        network={network}
        onWithdrawn={refresh}
        onCancelled={markRegistryEntryCancelled}
      />
    </div>
  );
};
