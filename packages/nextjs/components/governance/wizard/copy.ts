/**
 * The words the proposal wizard uses: what a kind is called, the path it takes, the CTA and notices
 * around the form, and the recipient lookup. Proposal-state copy — what a proposal's status, registry
 * entry or approvals are called once it exists — lives in `services/governance/proposalLabels`.
 */
import type { CouncilKey } from "@sh/core/governance/council";
import { type ProposalKind, isContractProposalKind } from "@sh/core/governance/proposalTypes";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";

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
  swapAdapterMissing:
    "The swap adapter is not deployed on this network, so a treasury swap cannot be proposed yet. " +
    "Run `yarn hardhat:deploy --network hederaTestnet` to deploy it; the other operations work without it.",
} as const;

export function missingProposerRoleLabel(accountId: string): string {
  return (
    `${accountId} does not hold PROPOSER_ROLE on the registry, so registering this proposal would revert. ` +
    "A native proposal, such as paying a supplier, needs no role."
  );
}

/**
 * The words the swap form uses. The floor gets a sentence of its own because it is the one input a
 * council actually votes on, and the reason it is a limit rather than a slippage tolerance is not
 * something a proposer can be expected to infer from the field.
 */
export const SWAP_FORM_LABELS = {
  amount: "HBAR to sell",
  floor: (symbol: string) => `Floor (${symbol})`,
  floorHint: "The least the treasury accepts. This is what the council approves, not the quote.",
  quote: (amount: string, symbol: string) => `SaucerSwap would pay ${amount} ${symbol} right now`,
  quoteLoading: "Asking SaucerSwap what that HBAR is worth…",
  quoteUnavailable: "No quote right now — the pool may have no liquidity for this size.",
  staleFloorNote:
    "The swap runs when the last signature lands, hours or days from now. The pool's price then is " +
    "nobody's to predict, which is why the floor is a limit order and not a tolerance around today's quote.",
  tokenUnreadable: (tokenId: string) =>
    `Could not read ${tokenId} on the Mirror Node, so the floor has no scale to be read in. Try again.`,
} as const;

/** Why a typed recipient is not yet an account the transfer can name. */
export const RECIPIENT_LOOKUP_LABELS = {
  malformed: (input: string) => `${input} is not an account id (0.0.x) or an EVM address`,
  loading: (input: string) => `Looking up ${input} on the Mirror Node…`,
  notFound: (input: string) => `No account found for ${input}`,
  unreachable: (input: string) => `Could not look up ${input} right now. Try again.`,
} as const satisfies Record<string, (input: string) => string>;
