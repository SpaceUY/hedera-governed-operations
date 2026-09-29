"use client";

import { ApproverList } from "./ApproverList";
import { HashScanLinks } from "./HashScanLinks";
import { OperationMeta } from "./OperationMeta";
import { ProposalStages } from "./ProposalStages";
import { UnseatedAgentRow } from "./UnseatedAgentRow";
import { WithdrawCancelActions } from "./WithdrawCancelActions";
import {
  COUNCIL_HEADINGS,
  DETAIL_COPY,
  FAMILY_COPY,
  ROTATION_NOTE,
  SIGN_LABELS,
  endNote,
  executedResult,
  noRejectNote,
  signatureHeadline,
  signatureSubline,
} from "./copy";
import { expiryCountdown } from "./expiryCountdown";
import { operationSummaryOf, proposalIdentityOf } from "./proposalIdentity";
import { type CouncilKey, memberSignedAt } from "@sh/core/governance/council";
import type { Proposal } from "@sh/core/governance/proposals";
import { MutationError } from "~~/components/governance/MutationError";
import type { MemberName } from "~~/components/governance/graph/mapModel";
import { gasLimitLabel } from "~~/components/governance/wizard/copy";
import { useCouncil } from "~~/hooks/mirror/useCouncil";
import { type CoSigningAgent, useCoSigningAgent } from "~~/hooks/useCoSigningAgent";
import { useSignProposal } from "~~/hooks/useSignProposal";
import { canBeSigned } from "~~/services/governance/proposalActions";
import {
  UNREACHABLE_REGISTRY_SIGN_WARNING,
  councilRuleLabel,
  executionFailureLabel,
  proposalStatusLabel,
  registryLabel,
  requiredSignaturesLabel,
} from "~~/services/governance/proposalLabels";
import type { HederaSignerKind } from "~~/services/web3/hederaSignerPort";
import { formatTinybars } from "~~/utils/scaffold-hbar/hbarAmount";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

/**
 * Where the panel sits: `page` where it is the whole rail, `inline` where it opens under a card in
 * the list on `/`. One choice sets the heading levels and the padding together: an inline panel reads
 * one level below the page's own title, leaves the title to the card right above it (for a screen
 * reader only), and fits a phone-width column.
 */
export type PanelVariant = "page" | "inline";

const VARIANT_LAYOUT = {
  page: { Title: "h1", sectionHeadingLevel: 2, container: "px-6 py-5", title: "text-lg" },
  inline: { Title: "h2", sectionHeadingLevel: 3, container: "px-4 py-4", title: "sr-only" },
} as const satisfies Record<PanelVariant, object>;

export type ProposalDetailPanelProps = {
  proposal: Proposal;
  accountId: string | null;
  /** Which signer the Sign button asks, so it can say where to approve. */
  signerKind: HederaSignerKind;
  governanceAccountId: string;
  executorContractId: string;
  network: HederaNetworkName;
  /** The council's seats as the map names them (`memberNamesOf`); generic names without them. */
  memberNames?: Readonly<Record<string, MemberName>>;
  /** The nodes the operation travels, by their names on the map (`routeNamesOf`); null when it cannot say. */
  route?: readonly string[] | null;
  /** Re-reads the schedule and, for a registry call, its entry — after Sign or Withdraw. */
  refresh: () => void;
  /** After Cancel: marks the entry cancelled without waiting on the relay. See `useProposalLookup`. */
  markRegistryEntryCancelled: () => void;
  variant?: PanelVariant;
};

/**
 * The body of a proposal's detail, shown by `/governance/[scheduleId]` and under the selected card on
 * `/` (both through `ProposalDetail`, which owns the reads): this component only renders what it is
 * handed and the actions that mutate it. From top to bottom: what it does and the path it travels,
 * Create → Sign → Executed, how many signatures it still needs, the council seat by seat — Sign sits
 * on the connected member's own row — how it ends, HashScan, Withdraw / Cancel, and the raw ids folded
 * away last.
 */
export const ProposalDetailPanel = ({
  proposal,
  accountId,
  signerKind,
  governanceAccountId,
  executorContractId,
  network,
  memberNames,
  route,
  refresh,
  markRegistryEntryCancelled,
  variant = "page",
}: ProposalDetailPanelProps) => {
  const { operation, registry, schedule, state } = proposal;
  const identity = proposalIdentityOf(proposal);
  const isPending = state.status === "pending";
  const executionFailure = executionFailureLabel(proposal);
  const registryUnreachable = operation.kind === "registryCall" && registry.status === "unreachable";
  const sign = useSignProposal();
  const council = useCouncil({ governanceAccountId, executorContractId, network });
  const agent = useCoSigningAgent(network);
  const unseatedAgentSeat = council.data ? unseatedAgentSeatOf(agent, council.data.key) : null;
  const proposers = council.data?.proposers ?? [];
  const rule = council.data ? councilRuleLabel(council.data.key) : `${proposal.progress.threshold}-of-?`;
  const { Title, sectionHeadingLevel, container, title } = VARIANT_LAYOUT[variant];

  // Sign goes on the viewer's own row. An account the proposer list does not know may still hold a
  // seat the app cannot match it to, so it gets the button under the list instead; a known proposer
  // without a seat gets none, since its signature would not count.
  const canSign = accountId !== null && canBeSigned(proposal);
  const viewerIsKnown = proposers.some(proposer => proposer.accountId === accountId);
  const signButton = canSign ? (
    <button
      type="button"
      className="btn btn-primary btn-sm shrink-0"
      onClick={() => sign.mutate(schedule.schedule_id, { onSuccess: refresh })}
      disabled={sign.isPending}
    >
      {SIGN_LABELS[signerKind]}
    </button>
  ) : null;

  const headline = signatureHeadline(proposal);
  const countdown = expiryCountdown(state.expiresAt, isPending);
  const creatorKey = proposers.find(proposer => proposer.accountId === schedule.creator_account_id)?.key;
  const creatorName = (creatorKey && memberNames?.[creatorKey]?.name) || schedule.creator_account_id;
  const ending = endNote(proposal);
  const noReject = noRejectNote(state.expiresAt);
  const listProps = {
    signedAt: signedAtOf(proposal),
    network,
    proposers,
    viewerAccountId: accountId,
    memberNames,
    isCollecting: isPending,
    signAction: signButton,
    agent,
    headingLevel: sectionHeadingLevel,
  };

  return (
    // Addresses and ids are single long words; letting them wrap anywhere keeps a phone from scrolling sideways.
    <div className={`${container} flex flex-col gap-5 wrap-anywhere`}>
      {variant === "page" ? (
        <header className="flex flex-col gap-1">
          <p className="m-0 text-xs text-base-content/60">{DETAIL_COPY.kicker(schedule.schedule_id)}</p>
          <Title className={`m-0 font-bold ${title} ${identity.unrecognized ? "text-warning" : ""}`}>
            {identity.title}
          </Title>
          <OperationMeta proposal={proposal} family={identity.family} />
        </header>
      ) : (
        <Title className={title}>{identity.title}</Title>
      )}

      <section className="flex flex-col gap-2">
        {identity.family && (
          <p
            className={`m-0 text-xs font-semibold ${identity.family === "contract" ? "text-primary" : "text-base-content/70"}`}
          >
            {FAMILY_COPY[identity.family].detail}
          </p>
        )}
        <p className={`m-0 text-sm ${identity.unrecognized ? "text-warning" : ""}`}>{operationSummaryOf(proposal)}</p>
        {route && route.length > 1 && (
          <ol aria-label={DETAIL_COPY.routeLabel} className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
            {route.map((step, index) => (
              <li key={`${step}-${index}`} className="flex items-center gap-1">
                {index > 0 && (
                  <span aria-hidden="true" className="text-base-content/50">
                    →
                  </span>
                )}
                <span className="badge badge-sm badge-outline border-dashed border-primary text-primary">{step}</span>
              </li>
            ))}
          </ol>
        )}
        {operation.kind === "registryCall" && registry.status === "missing" && (
          <p role="status" className="m-0 text-sm text-warning">
            {registryLabel(registry)}
          </p>
        )}
      </section>

      {identity.family && <ProposalStages proposal={proposal} family={identity.family} rule={rule} />}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {headline.count !== null && <span className="text-3xl font-bold tabular-nums">{headline.count}</span>}
        <p className="m-0 flex-1 text-sm">
          <span className="font-semibold">{headline.words}</span>
          <span className="text-base-content/70"> · {signatureSubline(rule, proposal.progress.signed)}</span>
        </p>
        {countdown && (
          <span
            className={`badge badge-sm font-semibold ${countdown.urgency === "final-hour" ? "badge-warning" : "badge-ghost"}`}
          >
            {countdown.label}
          </span>
        )}
      </div>

      {proposal.execution.status === "succeeded" && (
        <SucceededResult executedAt={state.executedAt} result={proposal.execution.transaction.result} />
      )}
      {executionFailure && (
        <p role="status" className="m-0 rounded-box border border-error bg-error/10 p-3 text-sm">
          {executionFailure}
        </p>
      )}

      {council.data && (
        <div className="flex flex-col gap-4">
          {operation.kind === "councilRotation" && proposal.incomingProgress ? (
            <>
              <ApproverList
                heading={`${COUNCIL_HEADINGS.current} · ${requiredSignaturesLabel(proposal.progress)}`}
                council={council.data.key}
                progress={proposal.progress}
                {...listProps}
              />
              <ApproverList
                heading={`${COUNCIL_HEADINGS.incoming} · ${requiredSignaturesLabel(proposal.incomingProgress)}`}
                council={operation.council}
                progress={proposal.incomingProgress}
                {...listProps}
              />
            </>
          ) : (
            <ApproverList
              heading={COUNCIL_HEADINGS.single}
              council={council.data.key}
              progress={proposal.progress}
              {...listProps}
            >
              {unseatedAgentSeat && (
                <UnseatedAgentRow ruleWithAgent={councilRuleLabel(withSeat(council.data.key, unseatedAgentSeat))} />
              )}
            </ApproverList>
          )}
        </div>
      )}

      {(canSign && !viewerIsKnown) || registryUnreachable || sign.error ? (
        <div className="flex flex-col items-start gap-2">
          {canSign && !viewerIsKnown && signButton}
          {registryUnreachable && (
            <p role="status" className="m-0 text-sm text-warning">
              {UNREACHABLE_REGISTRY_SIGN_WARNING}
            </p>
          )}
          <MutationError error={sign.error} />
        </div>
      ) : null}

      {isPending && (
        <div className="flex flex-col gap-2 text-sm text-base-content/70">
          <p className="m-0">
            <span className="font-semibold text-base-content">{noReject.lead}</span> {noReject.rest}
          </p>
          {proposal.incomingProgress && <p className="m-0">{ROTATION_NOTE}</p>}
        </div>
      )}

      <HashScanLinks
        proposal={proposal}
        network={network}
        creatorName={creatorName}
        headingLevel={sectionHeadingLevel}
      />

      {ending && <p className="m-0 text-sm text-base-content/70">{ending}</p>}

      <WithdrawCancelActions
        proposal={proposal}
        accountId={accountId}
        executorContractId={executorContractId}
        governanceAccountId={governanceAccountId}
        network={network}
        onWithdrawn={refresh}
        onCancelled={markRegistryEntryCancelled}
      />

      <RawFacts proposal={proposal} />
    </div>
  );
};

/**
 * The agent's seat while the council does not hold it. An agent whose key is not one public key can
 * never be seated, so it gets no row at all.
 */
function unseatedAgentSeatOf(agent: CoSigningAgent | null, council: CouncilKey): string | null {
  if (!agent?.seat || council.memberKeys.includes(agent.seat)) return null;
  return agent.seat;
}

/** The council once that seat is added at the same threshold — what "Add the co-signing agent" proposes. */
function withSeat(council: CouncilKey, seat: string): CouncilKey {
  return { threshold: council.threshold, memberKeys: [...council.memberKeys, seat] };
}

/**
 * When each counted seat's signature landed, from the signature rows the schedule already carries —
 * both councils' seats for a rotation, since either list may show them.
 */
function signedAtOf({ schedule, progress, incomingProgress }: Proposal): Record<string, string> {
  const signedAt: Record<string, string> = {};
  for (const key of [...progress.signedBy, ...(incomingProgress?.signedBy ?? [])]) {
    const at = memberSignedAt(schedule, key);
    if (at) signedAt[key] = at;
  }
  return signedAt;
}

const SucceededResult = ({ executedAt, result }: { executedAt: Date | null; result: string }) => {
  const copy = executedResult(executedAt, result);
  return (
    <div role="status" className="flex flex-col gap-1 rounded-box border border-success bg-success/10 p-3 text-sm">
      <p className="m-0 font-semibold">{copy.title}</p>
      <p className="m-0">{copy.line}</p>
      <p className="m-0 text-base-content/70">{copy.why}</p>
    </div>
  );
};

/** Everything a person should not need but an auditor might: ids, the function, gas and the raw body. */
const RawFacts = ({ proposal }: { proposal: Proposal }) => {
  const { operation, registry, schedule, state } = proposal;
  const labels = DETAIL_COPY.raw;
  const isCall = operation.kind === "registryCall";
  const rows: [string, string][] = [
    [labels.scheduleId, schedule.schedule_id],
    [
      labels.registryEntry,
      isCall
        ? DETAIL_COPY.entryIn(operation.proposalId, operation.executorContractId, registryLabel(registry))
        : DETAIL_COPY.noEntry,
    ],
    [labels.function, isCall ? DETAIL_COPY.executeCall(operation.proposalId) : DETAIL_COPY.nativeCall],
    [labels.gas, gasLimitLabel(isCall ? operation.gas : null)],
    ...(isCall && operation.payableTinybars > 0n
      ? [[labels.hbar, formatTinybars(operation.payableTinybars)] as [string, string]]
      : []),
    [labels.status, proposalStatusLabel(proposal)],
    [labels.creator, schedule.creator_account_id],
    [labels.payer, schedule.payer_account_id],
    ...(state.expiresAt ? [[labels.expires, state.expiresAt.toLocaleString()] as [string, string]] : []),
    [labels.body, schedule.transaction_body],
  ];
  return (
    <details className="@container">
      <summary className="cursor-pointer text-sm font-semibold text-base-content/70">{DETAIL_COPY.rawSummary}</summary>
      <dl className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 text-xs @sm:grid-cols-3">
        {rows.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-base-content/60">{term}</dt>
            <dd className="m-0 font-mono break-all @sm:col-span-2">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
};
