/**
 * The words a screen uses for a proposal's state. The domain values (`notApplicable`, `deleted`, …)
 * name the data model; these name what a council member needs to know about the proposal.
 */
import type { ThresholdProgress } from "@sh/core/governance/council";
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

export function scheduleStatusLabel(status: ScheduleStatus): string {
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
