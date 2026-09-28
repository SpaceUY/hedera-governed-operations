/**
 * What changed on the ledger between two reads of governance, as the events a map animates. The map
 * never animates a click: a button only submits a transaction, and the next read says what happened,
 * so a signature from another device plays exactly like one sent from this screen.
 *
 * Only transitions produce events. A proposal that leaves the inbox window — pushed out by newer
 * ones — did not change on the ledger, so it produces nothing; one that appears in the window is
 * new only if the previous read could have listed it. Every event carries the consensus timestamp of
 * what it describes, and one older than `EVENT_FRESHNESS_MS` is dropped: a tab that was hidden, or a
 * read that lagged, shows where things are now rather than replaying what happened while nobody
 * watched.
 */
import type { TreasuryFigures } from "./treasury";
import { type CouncilKey, type Proposer, memberSignedAt } from "@sh/core/governance/council";
import type { Proposal } from "@sh/core/governance/proposals";
import { compareMirrorTimestamps, mirrorTimestampToDate } from "@sh/core/mirror";

/**
 * How old an event may be and still play. A change reaches the screen after Mirror has indexed it
 * (seconds, up to ~20 s measured) and the inbox has polled again (5 s while anything is pending, 30 s
 * once everything has settled, which is when a proposal opened elsewhere shows up); an execution's
 * outcome can take one more poll. A minute covers that path with room for a client clock a few
 * seconds off; anything older was missed, not late.
 */
export const EVENT_FRESHNESS_MS = 60_000;

/** One comparable read of governance: everything the map draws, from the queries that already poll it. */
export type GovernanceSnapshot = {
  council: CouncilKey;
  /** `PROPOSER_ROLE` holders, which the graph draws as the arcs into the registry. */
  proposers: Proposer[];
  /** The inbox, newest first. */
  proposals: Proposal[];
  /** Proposers whose proposals are missing from this read (`ProposalInbox.unreachableProposers`). */
  unreachableProposers: string[];
  /** Null until the figures are read, or when they could not be: they never hold back the events. */
  treasury: TreasuryFigures | null;
};

/**
 * `at` is the Mirror consensus timestamp (`seconds.nanos`) of the change itself: the schedule's
 * creation, the member's first signature row, the scheduled transaction.
 */
export type AnimationEvent =
  | { kind: "proposed"; scheduleId: string; at: string }
  | { kind: "approved"; scheduleId: string; memberKey: string; at: string }
  | { kind: "executed"; scheduleId: string; at: string }
  | { kind: "reverted"; scheduleId: string; at: string; result: string }
  | {
      kind: "councilChanged";
      /** The executed rotation that installed this council, or null when no rotation in the inbox did. */
      scheduleId: string | null;
      at: string | null;
      /** The council now in place. */
      council: CouncilKey;
    };

/** Within one consensus instant, the order a proposal lives through them. */
const KIND_ORDER: Record<AnimationEvent["kind"], number> = {
  proposed: 0,
  approved: 1,
  executed: 2,
  reverted: 2,
  councilChanged: 3,
};

/**
 * The identity of an event, `kind:scheduleId:memberKey`, so a queue can drop one it has already
 * played. A council change is identified by the council it installed.
 */
export function animationEventKey(event: AnimationEvent): string {
  switch (event.kind) {
    case "approved":
      return `approved:${event.scheduleId}:${event.memberKey}`;
    case "councilChanged":
      return `councilChanged:${event.scheduleId ?? ""}:${event.council.threshold}/${event.council.memberKeys.join(",")}`;
    default:
      return `${event.kind}:${event.scheduleId}:`;
  }
}

const sameCouncil = (left: CouncilKey, right: CouncilKey): boolean =>
  left.threshold === right.threshold &&
  left.memberKeys.length === right.memberKeys.length &&
  left.memberKeys.every(key => right.memberKeys.includes(key));

/** Every member who approved, on either council a rotation waits for, each once. */
const approversOf = (proposal: Proposal): string[] => [
  ...new Set([...proposal.progress.signedBy, ...(proposal.incomingProgress?.signedBy ?? [])]),
];

/** A proposal's own events since the previous read, `before` being undefined when it is new. */
function proposalEvents(before: Proposal | undefined, after: Proposal): AnimationEvent[] {
  const scheduleId = after.schedule.schedule_id;
  const events: AnimationEvent[] = [];
  if (!before) events.push({ kind: "proposed", scheduleId, at: after.schedule.consensus_timestamp });

  const approvedBefore = before ? approversOf(before) : [];
  for (const memberKey of approversOf(after)) {
    if (approvedBefore.includes(memberKey)) continue;
    const at = memberSignedAt(after.schedule, memberKey);
    if (at) events.push({ kind: "approved", scheduleId, memberKey, at });
  }

  // Triggered by the outcome, never by `executed_timestamp` alone: Mirror can serve a schedule as
  // executed before the row that says whether it succeeded, and a map that played the success first
  // would have to take it back.
  const { execution } = after;
  const at = after.schedule.executed_timestamp;
  if (!at || before?.execution.status === execution.status) return events;
  if (execution.status === "succeeded") events.push({ kind: "executed", scheduleId, at });
  if (execution.status === "failed") events.push({ kind: "reverted", scheduleId, at, result: execution.result });
  return events;
}

/**
 * The rotation that installed `council`: the latest one that ran, did not fail, and proposed exactly
 * it. Its outcome may still be unconfirmed: the council is re-read as soon as the schedule reads as
 * executed, usually before the outcome is, and the council having changed is proof enough.
 */
function rotationThatInstalled(council: CouncilKey, proposals: readonly Proposal[]): Proposal | undefined {
  return proposals
    .filter(
      ({ operation, schedule, execution }) =>
        operation.kind === "councilRotation" &&
        schedule.executed_timestamp !== null &&
        execution.status !== "failed" &&
        sameCouncil(operation.council, council),
    )
    .sort((left, right) =>
      compareMirrorTimestamps(right.schedule.executed_timestamp ?? "0", left.schedule.executed_timestamp ?? "0"),
    )[0];
}

function councilEvents(previous: GovernanceSnapshot, next: GovernanceSnapshot): AnimationEvent[] {
  if (sameCouncil(previous.council, next.council)) return [];
  const rotation = rotationThatInstalled(next.council, next.proposals);
  return [
    {
      kind: "councilChanged",
      scheduleId: rotation?.schedule.schedule_id ?? null,
      at: rotation?.schedule.executed_timestamp ?? null,
      council: next.council,
    },
  ];
}

/**
 * A change nobody could date — a council that changed through no rotation in the inbox — still
 * plays: it only surfaces on a council read, which a settled proposal triggers.
 */
function isFresh(event: AnimationEvent, now: Date): boolean {
  const happenedAt = mirrorTimestampToDate(event.at);
  return !happenedAt || now.getTime() - happenedAt.getTime() <= EVENT_FRESHNESS_MS;
}

/** Not `localeCompare`, whose order depends on the browser's locale. */
const byCodeUnits = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/** Oldest first; within one instant a proposal is proposed, then approved, then run. */
function chronologically(left: AnimationEvent, right: AnimationEvent): number {
  if (left.at !== right.at) {
    if (left.at === null) return 1;
    if (right.at === null) return -1;
    const byTime = compareMirrorTimestamps(left.at, right.at);
    if (byTime !== 0) return byTime;
  }
  return (
    KIND_ORDER[left.kind] - KIND_ORDER[right.kind] || byCodeUnits(animationEventKey(left), animationEventKey(right))
  );
}

/**
 * The events that take `previous` to `next`, oldest first, dropping any older than
 * `EVENT_FRESHNESS_MS` at `now` (when `next` was read).
 *
 * A proposal missing from `previous` is new, unless its creator was one of the proposers that read
 * could not list: then it was there all along, hidden, and its signatures are not news either.
 */
export function diffSnapshots(previous: GovernanceSnapshot, next: GovernanceSnapshot, now: Date): AnimationEvent[] {
  const before = new Map(previous.proposals.map(proposal => [proposal.schedule.schedule_id, proposal]));
  const events = next.proposals.flatMap(proposal => {
    const earlier = before.get(proposal.schedule.schedule_id);
    if (!earlier && previous.unreachableProposers.includes(proposal.schedule.creator_account_id)) return [];
    return proposalEvents(earlier, proposal);
  });

  return [...events, ...councilEvents(previous, next)].filter(event => isFresh(event, now)).sort(chronologically);
}
