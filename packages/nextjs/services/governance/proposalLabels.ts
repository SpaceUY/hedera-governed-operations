/**
 * The words a screen uses for a proposal's state. The domain values (`notApplicable`, `deleted`, …)
 * name the data model; these name what a council member needs to know about the proposal.
 */
import type { CouncilKey, ThresholdProgress } from "@sh/core/governance/council";
import { type ProposalKind, isContractProposalKind } from "@sh/core/governance/proposalTypes";
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

/** The title a proposal of each kind goes by, and the short hint beside it in the picker. */
export const PROPOSAL_KIND_COPY: Record<ProposalKind, { title: string; hint: string }> = {
  upgrade: { title: "Upgrade the vault to v2", hint: "unlocks withdrawals" },
  treasurySwap: { title: "Sell treasury HBAR for USDC", hint: "with a floor" },
  tokenAdmin: { title: "Pause, unpause or freeze ACME", hint: "token keys" },
  treasuryTransfer: { title: "Pay a supplier", hint: "direct transfer" },
  councilRotation: { title: "Change the council", hint: "rewrites the treasury key" },
};

export const PROPOSAL_FAMILY_HEADINGS = {
  contract: "Contract calls · through the registry",
  native: "Native · no contract, no registry entry",
} as const;

/** The path an approved proposal travels, as the preview's chips show it. */
export const PROPOSAL_PATH_CHIPS: Record<ProposalKind, string[]> = {
  upgrade: ["Treasury", "Registry", "Vault"],
  treasurySwap: ["Treasury", "Registry", "Swap adapter", "SaucerSwap", "Treasury"],
  tokenAdmin: ["Treasury", "Registry", "Token admin", "ACME"],
  treasuryTransfer: ["Treasury", "Recipient"],
  councilRotation: ["Treasury", "its own key"],
};

export function councilRuleLabel(council: CouncilKey): string {
  return `${council.threshold}-of-${council.memberKeys.length}`;
}

/** A scheduled call that succeeds is charged its whole limit, so the limit is a price, not headroom. */
export function gasLimitLabel(executeGas: number | null): string {
  if (executeGas === null) return "n/a — native, network fee only";
  return `${executeGas.toLocaleString()} — charged in full on success`;
}

const SECONDS_PER_DAY = 24 * 60 * 60;

export function expiryLabel(expirySeconds: number): string {
  const days = Math.round(expirySeconds / SECONDS_PER_DAY);
  return `${days} ${days === 1 ? "day" : "days"} after scheduling. Unsigned, it simply lapses.`;
}

/**
 * Registering a contract-backed proposal is a transaction of its own and never an approval. The
 * `ScheduleCreate` that follows does count when the proposer holds a seat, so the sentence stays on
 * registering and makes no claim about the schedule.
 */
export function approverLabel(kind: ProposalKind, council: CouncilKey): string {
  const rule = `The ${councilRuleLabel(council)} council.`;
  return isContractProposalKind(kind) ? `${rule} Registering the proposal is not an approval.` : rule;
}

export function openProposalCopy(kind: ProposalKind): { cta: string; note: string } {
  if (isContractProposalKind(kind)) {
    return {
      cta: "Register and schedule with your wallet",
      note: "Two transactions — register it in the registry, then schedule the call. Neither executes anything.",
    };
  }
  return {
    cta: "Schedule with your wallet",
    note: "One transaction — a native schedule. No registry entry is created.",
  };
}

/** What the wizard says about who may open a proposal, around the form rather than inside it. */
export const OPEN_PROPOSAL_NOTICES = {
  connectWallet: "Connect a wallet to propose. The proposal is opened and paid for by your account.",
  proposersLoading: "Reading who holds PROPOSER_ROLE on the registry…",
  proposersUnreadable: "Could not read who holds PROPOSER_ROLE right now, so this proposal cannot be registered yet.",
  upgradeTargetMissing:
    "The vault's next implementation is not deployed on this network, so a vault upgrade cannot be proposed yet. " +
    "Run `yarn hardhat:deploy --network hederaTestnet` to deploy it; paying a supplier works without it.",
} as const;

export function missingProposerRoleLabel(accountId: string): string {
  return (
    `${accountId} does not hold PROPOSER_ROLE on the registry, so registering this proposal would revert. ` +
    "A native proposal, such as paying a supplier, needs no role."
  );
}

/** Why a typed recipient is not yet an account the transfer can name. */
export const RECIPIENT_LOOKUP_LABELS = {
  malformed: (input: string) => `${input} is not an account id (0.0.x) or an EVM address`,
  loading: (input: string) => `Looking up ${input} on the Mirror Node…`,
  notFound: (input: string) => `No account found for ${input}`,
  unreachable: (input: string) => `Could not look up ${input} right now. Try again.`,
} as const satisfies Record<string, (input: string) => string>;

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
