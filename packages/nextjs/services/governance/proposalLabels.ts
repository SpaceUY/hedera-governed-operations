/**
 * The words a screen uses for a proposal's state. The domain values (`notApplicable`, `deleted`, …)
 * name the data model; these name what a council member needs to know about the proposal. Wizard
 * copy — kind titles, the path a proposal takes, notices, CTAs — lives in `components/governance/wizard/copy`.
 */
import type { ThresholdProgress } from "@sh/core/governance/council";
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

/** A rotation is counted against both councils, since the schedule waits for each one's threshold. */
export function approvalsLabel(progress: ThresholdProgress, incomingProgress: ThresholdProgress | null): string {
  if (!incomingProgress) return `${progress.signed} of ${progress.threshold} council signatures`;
  return (
    `Current council: ${progress.signed} of ${progress.threshold} signatures · ` +
    `Incoming council: ${incomingProgress.signed} of ${incomingProgress.threshold} signatures`
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
