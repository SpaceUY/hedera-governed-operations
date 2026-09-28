/**
 * The words a screen uses for a proposal's state. The domain values (`notApplicable`, `deleted`, …)
 * name the data model; these name what a council member needs to know about the proposal.
 */
import type { CouncilKey, ThresholdProgress } from "./council";
import type { EdgeKind, NodeRole } from "./graph";
import { type ProposalKind, isContractProposalKind } from "./proposalTypes";
import type { Proposal } from "./proposals";
import type { RegistryCrossCheck, RegistryEntryState } from "./registry";
import type { ScheduleStatus } from "~~/services/mirror";

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
const requiredSignaturesLabel = ({ signed, threshold }: ThresholdProgress): string =>
  `${signed} of ${threshold} required signatures`;

/** A rotation is counted against both councils, since the schedule waits for each one's threshold. */
export function approvalsLabel(progress: ThresholdProgress, incomingProgress: ThresholdProgress | null): string {
  if (!incomingProgress) return requiredSignaturesLabel(progress);
  return (
    `Current council: ${requiredSignaturesLabel(progress)} · ` +
    `Incoming council: ${requiredSignaturesLabel(incomingProgress)}`
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

/** The map's status line while nothing else claims it: how a proposal ends, since no button ends it. */
export const LIVE_MAP_STATUS_NOTE =
  "Each proposal runs by itself the moment the council's threshold has signed it. There is no execute button " +
  "and no reject: a proposal nobody signs in time expires, and nothing runs.";

/** The governance home's words for the inbox, split into open approval rounds and settled ones. */
export const INBOX_COPY = {
  pendingHeading: "Pending proposals",
  settledHeading: "Settled",
  noPending: "No proposal is waiting for signatures.",
} as const;

/**
 * The words the governance map uses. Nodes are named for what exists on the ledger, never for an
 * action: an operation is something that travels along the edges and then switches off.
 */
export const MAP_LABELS = {
  title: "Map of the governed system: who may act, and where the money is",
  loading: "Reading the council from the Mirror Node…",
  unavailable: "The council could not be read, so the map cannot be drawn right now.",
  governanceAccount: "Treasury",
  executor: "Proposal registry",
  vault: "Vault",
  tokenAdmin: "Token admin",
  swapAdapter: "Swap adapter",
  router: "Swap router",
  councilCaption: "council",
  /** The seat the connected account holds. */
  you: "You",
} as const;

/** What a node is, under its name; a demo layout may say it more specifically. */
export const MAP_NODE_CAPTIONS: Record<NodeRole, string> = {
  member: "council member",
  proposer: "may propose",
  governanceAccount: "governance account",
  executor: "only the treasury may run it",
  target: "contract",
  token: "HTS token",
  external: "outside the system",
};

/** A council member whose account is not known here, by the start of its key. */
export function unnamedMemberLabel(key: string): string {
  return `Member ${key.slice(0, 6)}…`;
}

const EDGE_KIND_LABELS: Record<EdgeKind, string> = {
  authority: "May act",
  intent: "Would happen",
  funds: "Money",
};

/**
 * What an edge means, from the roles at its ends. The standing edges are the trust chain: a seat on
 * the council, `PROPOSER_ROLE`, `EXECUTOR_ROLE`, a contract that only accepts the registry.
 */
export function mapEdgeCaption(kind: EdgeKind, from: NodeRole, to: NodeRole): string {
  if (kind === "funds") return "where the money is";
  if (kind === "intent") return "a pending proposal would use this";
  if (to === "governanceAccount") return "is one of the keys";
  if (to === "executor" && from === "governanceAccount") return "EXECUTOR_ROLE · runs what the council approved";
  if (to === "executor") return "PROPOSER_ROLE · registers with 1 signature, no council";
  if (from === "executor") return "only accepts the registry";
  if (to === "token") return "holds the token's keys";
  return "calls it";
}

/** The accessible name of an edge: what kind it is, between which nodes, and what it means. */
export function mapEdgeLabel(kind: EdgeKind, ends: { from: string; to: string }, caption: string): string {
  return `${EDGE_KIND_LABELS[kind]}: ${ends.from} to ${ends.to}, ${caption}`;
}

/** The legend, always on the canvas. */
export const MAP_LEGEND = {
  heading: "Legend",
  lines: [
    { swatch: "authority", term: "Solid", meaning: "who may act" },
    { swatch: "preview", term: "Dashed violet", meaning: "would happen" },
    { swatch: "funds", term: "Dotted", meaning: "where the money is" },
    { swatch: "activity", term: "Amber · mint", meaning: "in progress · done, then it switches off" },
  ],
  shapes: { account: "account", contract: "contract", token: "token" },
} as const;
