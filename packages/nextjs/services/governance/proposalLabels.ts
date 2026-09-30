/**
 * The words a screen uses for a proposal's state. The domain values (`notApplicable`, `deleted`, …)
 * name the data model; these name what a council member needs to know about the proposal, plus the
 * inbox headings and the status note the live map shows around those states. Wizard copy — kind
 * titles, the path a proposal takes, notices, CTAs — lives in `components/governance/wizard/copy`,
 * the map's node, edge and legend words in `components/governance/graph/copy`, and the rail's card,
 * detail and Withdraw / Cancel words in `components/governance/rail/copy`.
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
  if (registry.status === "unreachable") {
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

/** The governance home's words for the inbox, split into open approval rounds and settled ones. */
export const INBOX_COPY = {
  pendingHeading: "Pending operations",
  settledHeading: "Recent",
  noPending: "No proposal is waiting for signatures.",
  loading: "Loading proposals",
} as const;

/**
 * Under the inbox's heading: how a proposal ends, since no button ends it. `rule` is the council's
 * "m-of-n", or null before the council has been read; the screen sets `council` in bold.
 */
export function runsByItselfNote(rule: string | null) {
  return {
    lead: "Each one runs by itself the moment the ",
    council: rule ? `${rule} council` : "council",
    rest: " has signed it. There is no execute button.",
  };
}
