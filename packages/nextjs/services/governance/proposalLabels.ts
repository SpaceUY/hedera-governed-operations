/**
 * The words a screen uses for a proposal's state. The domain values (`notApplicable`, `deleted`, …)
 * name the data model; these name what a council member needs to know about the proposal, plus the
 * inbox headings and the status note the live map shows around those states. Wizard copy — kind
 * titles, the path a proposal takes, notices, CTAs — lives in `components/governance/wizard/copy`,
 * and the map's node, edge and legend words in `components/governance/graph/copy`.
 */
import type { CouncilKey, Proposer, ThresholdProgress } from "@sh/core/governance/council";
import type { Proposal } from "@sh/core/governance/proposals";
import type { RegistryCrossCheck, RegistryEntryState } from "@sh/core/governance/registry";
import type { ScheduleStatus } from "@sh/core/mirror";

const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  pending: "Collecting signatures",
  executed: "Executed",
  deleted: "Withdrawn",
  expired: "Expired",
};

const REGISTRY_ENTRY_LABELS: Record<RegistryEntryState, string> = {
  pending: "Pending",
  executed: "Executed",
  cancelled: "Cancelled",
};

function scheduleStatusLabel(status: ScheduleStatus): string {
  return SCHEDULE_STATUS_LABELS[status];
}

export function registryLabel(registry: RegistryCrossCheck): string {
  switch (registry.status) {
    case "read":
      return REGISTRY_ENTRY_LABELS[registry.entry.state];
    case "notApplicable":
      return "None: the network runs this operation directly";
    case "notRead":
      return "Not read: the proposal is no longer collecting signatures";
    case "missing":
      return "No usable entry: do not sign";
    case "unreachable":
      return "Could not be read right now";
  }
}

/**
 * Signatures collected out of the threshold, never out of the council's size: a bare "2 of 2" beside
 * a 2-of-3 council reads as a council of two, so the count says what it is counted against.
 */
export const requiredSignaturesLabel = ({ signed, threshold }: ThresholdProgress): string =>
  `${signed} of ${threshold} required signatures`;

/**
 * A council member by the account that holds its seat, or by the start of its key when no proposer
 * holds it — the same name on the map and in a proposal's approver list. `viewerAccountId` overrides both with "You",
 * since the connected account reads better as itself than as its own account id.
 */
export function memberLabel(memberKey: string, proposers: readonly Proposer[], viewerAccountId: string | null): string {
  const proposer = proposers.find(candidate => candidate.key === memberKey);
  if (proposer && proposer.accountId === viewerAccountId) return "You";
  return proposer?.accountId ?? `Member ${memberKey.slice(0, 6)}…`;
}

/** The council's rule, the same on the map, the treasury strip and the wizard's preview. */
export function councilRuleLabel(council: CouncilKey): string {
  return `${council.threshold}-of-${council.memberKeys.length}`;
}

/** A rotation is counted against both councils, since the schedule waits for each one's threshold. */
export function approvalsLabel(progress: ThresholdProgress, incomingProgress: ThresholdProgress | null): string {
  if (!incomingProgress) return requiredSignaturesLabel(progress);
  return (
    `Current council: ${requiredSignaturesLabel(progress)} · ` +
    `Incoming council: ${requiredSignaturesLabel(incomingProgress)}`
  );
}

/**
 * A proposal's status. The schedule's own "Executed" only says the network ran the transaction, and a
 * call that reverted ran too, so a proposal that executed says whether it worked.
 */
export function proposalStatusLabel({ state, execution }: Pick<Proposal, "state" | "execution">): string {
  if (state.status !== "executed") return scheduleStatusLabel(state.status);
  switch (execution.status) {
    case "succeeded":
      return "Executed";
    case "failed":
      return "Failed when it ran";
    case "notRun":
    case "unconfirmed":
      return "Executed, confirming the result";
  }
}

/**
 * What a failed execution means and what retrying takes, or null when nothing failed. A revert leaves
 * the registry entry as it was, so a pending entry is retried by scheduling `execute(id)` again for
 * the council to sign — not by proposing it again.
 */
export function executionFailureLabel({
  execution,
  operation,
  registry,
}: Pick<Proposal, "execution" | "operation" | "registry">): string | null {
  if (execution.status !== "failed") return null;
  const outcome =
    `The network ran it and answered ${execution.result}: nothing changed, ` +
    "and the governance account still paid its fee.";
  if (operation.kind !== "registryCall") return `${outcome} To try again, schedule the same operation again.`;
  if (registry.status === "unreachable" || registry.status === "notRead") {
    return `${outcome} The registry entry could not be read, so whether it can run again is not known yet.`;
  }
  if (registry.status !== "read") {
    return `${outcome} There is no usable registry entry behind it, so it cannot run again.`;
  }
  if (registry.entry.state !== "pending") {
    return `${outcome} The registry entry is ${REGISTRY_ENTRY_LABELS[registry.entry.state].toLowerCase()}, so it cannot run again.`;
  }
  return (
    `${outcome} The registry entry is still pending: retrying means scheduling execute(${registry.entry.proposalId}) ` +
    "again for the council to sign, not proposing it again."
  );
}

/**
 * Shown next to Sign for a registry call whose entry could not be read: the app cannot confirm it is
 * still pending, but the network is the final check, so signing goes ahead anyway.
 */
export const UNREACHABLE_REGISTRY_SIGN_WARNING =
  "The registry couldn't be checked just now, so the app can't confirm this entry is still pending. " +
  "You can still sign — if it turns out the entry no longer accepts signatures, the network will refuse it.";

/** The map's status line while nothing else claims it: how a proposal ends, since no button ends it. */
export const LIVE_MAP_STATUS_NOTE =
  "Each proposal runs by itself the moment the council's threshold has signed it. There is no execute button " +
  "and no reject: a proposal nobody signs in time expires, and nothing runs.";

/**
 * Why Withdraw has to happen before Cancel is offered: a schedule left alive for a cancelled entry
 * would still be able to reach its threshold, and that reverts with `ProposalNotPending` and bills
 * the governance account for the gas rather than doing nothing for free.
 */
export const WITHDRAW_BEFORE_CANCEL_NOTE =
  "Cancelling the registry entry becomes available once no schedule is still open for it — withdrawn, " +
  "expired, or run and failed — so a signature reaching the threshold afterwards can never revert and " +
  "bill the treasury.";

/**
 * The choice a proposer with an open Cancel button actually faces. The registry entry has no expiry
 * of its own: only its schedule does, and a new one can be opened for it at any time.
 */
export const CANCEL_VS_EXPIRE_NOTE =
  "Cancelling ends this proposal for good. Left alone, the entry stays pending and nothing runs, but anyone " +
  "can schedule it again for the council to approve; an expired or withdrawn schedule does not end it.";

/** Shown in place of Cancel while another schedule for the same entry could still reach its threshold. */
export const CANCEL_BLOCKED_BY_OPEN_SCHEDULE_NOTE =
  "Another schedule for this entry is still collecting signatures. It has to be withdrawn or expire before " +
  "the entry can be cancelled:";

/** Shown in place of the Cancel button to whoever `GovernedExecutor.cancel` would refuse. */
export const CANCEL_UNAUTHORIZED_NOTE =
  "Only the account that registered this entry, or the governance account, can cancel it.";

/** The governance home's words for the inbox, split into open approval rounds and settled ones. */
export const INBOX_COPY = {
  pendingHeading: "Pending proposals",
  settledHeading: "Settled",
  noPending: "No proposal is waiting for signatures.",
} as const;
