/**
 * The words the proposal wizard uses across kinds: what a kind is called, the path it takes, the CTA
 * and notices around the form, and the account lookup the forms share. A kind's own words live in its
 * folder under `kinds/`. Proposal-state copy — what a proposal's status, registry entry or approvals
 * are called once it exists — lives in `services/governance/proposalLabels`.
 */
import type { CouncilKey } from "@sh/core/governance/council";
import { type ProposalKind, isContractProposalKind } from "@sh/core/governance/proposalTypes";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";
import type { UnscheduledEntry } from "~~/services/governance/unscheduledEntry";

/** The title a proposal of each kind goes by, and the short hint beside it in the picker. */
export const PROPOSAL_KIND_COPY: Record<ProposalKind, { title: string; hint: string }> = {
  upgrade: { title: "Upgrade the vault to v2", hint: "unlocks withdrawals" },
  treasurySwap: { title: "Sell treasury HBAR for USDC", hint: "with a floor" },
  tokenAdmin: { title: "Pause, unpause or freeze the token", hint: "token keys" },
  treasuryTransfer: { title: "Pay a supplier", hint: "direct transfer" },
  councilRotation: { title: "Add the co-signing agent", hint: "one more seat on the council" },
};

export const PROPOSAL_FAMILY_HEADINGS = {
  contract: "Contract calls · through the registry",
  native: "Native · no contract, no registry entry",
} as const;

/** The path an approved proposal travels, as the preview's chips show it. */
export const PROPOSAL_PATH_CHIPS: Record<ProposalKind, string[]> = {
  upgrade: ["Treasury", "Registry", "Vault"],
  treasurySwap: ["Treasury", "Registry", "Swap adapter", "SaucerSwap", "Treasury"],
  tokenAdmin: ["Treasury", "Registry", "Token admin", "Token"],
  treasuryTransfer: ["Treasury", "Recipient"],
  councilRotation: ["Treasury", "its own key"],
};

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

/**
 * A rotation is approved by two councils, since the schedule waits for the current council's threshold
 * and for the proposed one's; the preview names both, the proposed one as the decoder read it back.
 */
export function rotationApproverLabel(current: CouncilKey | undefined, proposed: CouncilKey): string {
  const outgoing = current ? `The current ${councilRuleLabel(current)} council` : "The current council";
  return `${outgoing} and the proposed ${councilRuleLabel(proposed)} council, each to its own threshold.`;
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

/** The CTA once this exact call is registered already, and only its schedule is left to create. */
export function scheduleRegisteredEntryCopy(entry: UnscheduledEntry): { cta: string; note: string } {
  const name = entry.registryProposalId === null ? "the registered entry" : `entry ${entry.registryProposalId}`;
  return {
    cta: `Schedule ${name} with your wallet`,
    note:
      `This call is already registered (transaction ${entry.registrationTransactionId}); the last attempt stopped ` +
      `before its schedule. One transaction: it schedules ${name} and does not register the call again.`,
  };
}

/** What the wizard says about who may open a proposal, around the form rather than inside it. */
export const OPEN_PROPOSAL_NOTICES = {
  connectWallet: "Connect a wallet to propose. The proposal is opened and paid for by your account.",
  proposersLoading: "Reading who holds PROPOSER_ROLE on the registry…",
  proposersUnreadable: "Could not read who holds PROPOSER_ROLE right now, so this proposal cannot be registered yet.",
} as const;

export function missingProposerRoleLabel(accountId: string): string {
  return (
    `${accountId} does not hold PROPOSER_ROLE on the registry, so registering this proposal would revert. ` +
    "A native proposal, such as paying a supplier, needs no role."
  );
}

/** Why a typed account — a recipient, the holder to freeze — is not yet one the proposal can name. */
export const ACCOUNT_LOOKUP_LABELS = {
  malformed: (input: string) => `${input} is not an account id (0.0.x) or an EVM address`,
  loading: (input: string) => `Looking up ${input} on the Mirror Node…`,
  notFound: (input: string) => `No account found for ${input}`,
  unreachable: (input: string) => `Could not look up ${input} right now. Try again.`,
} as const satisfies Record<string, (input: string) => string>;

export function tokenUnreadableLabel(tokenId: string): string {
  return `Could not read token ${tokenId} on the Mirror Node right now.`;
}
