/**
 * The words the proposal wizard uses across kinds: what a kind is called, the path it takes, the CTA
 * and notices around the form, and the account lookup the forms share. A kind's own words live in its
 * folder under `kinds/`. Proposal-state copy — what a proposal's status, registry entry or approvals
 * are called once it exists — lives in `services/governance/proposalLabels`.
 */
import type { CouncilKey } from "@sh/core/governance/council";
import { type ProposalKind, isContractProposalKind } from "@sh/core/governance/proposalTypes";
import type { LateSubmission, WalletRequest } from "~~/hooks/useWalletRequest";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";
import type { UnscheduledEntry } from "~~/services/governance/unscheduledEntry";
import { validityWindowLabel } from "~~/services/web3/hederaSigner";
import type { HederaSignerKind } from "~~/services/web3/hederaSignerPort";

/** The title a proposal of each kind goes by, and the short hint beside it in the picker. */
export const PROPOSAL_KIND_COPY: Record<ProposalKind, { title: string; hint: string }> = {
  upgrade: { title: "Upgrade the vault to v2", hint: "unlocks withdrawals" },
  treasurySwap: { title: "Sell treasury HBAR for USDC", hint: "with a floor" },
  tokenAdmin: { title: "Pause, unpause or freeze the token", hint: "token keys" },
  treasuryTransfer: { title: "Pay a supplier", hint: "direct transfer" },
  councilRotation: { title: "Change the council", hint: "one more seat on the council" },
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

const WALLET_REQUEST_ACTIONS: Record<WalletRequest["action"], string> = {
  register: "register the call in the registry",
  schedule: "schedule the call for the council",
};

/**
 * Where to act while the submit waits on a signature. The test signer signs on its own, so only
 * HashPack is named, with the window after which the network would refuse the transaction.
 */
export function walletRequestLabel(request: WalletRequest, signerKind: HederaSignerKind): string {
  const step = `Step ${request.step} of ${request.steps}: ${WALLET_REQUEST_ACTIONS[request.action]}.`;
  if (signerKind === "burner") return `${step} Signing with the test signer…`;
  return `${step} Approve it in HashPack — the request is valid for ${validityWindowLabel(request.validForSeconds)}.`;
}

/**
 * A step the wizard stopped waiting for and the network accepted anyway — possible only when this
 * computer's clock runs ahead of the network's. Said rather than dropped, since it created something.
 */
export function lateSubmissionLabel(late: LateSubmission): string {
  return (
    `HashPack sent step ${late.step} of ${late.steps} after the wizard stopped waiting, and the network accepted it ` +
    `(transaction ${late.transactionId}). The proposals are refreshed; check them before trying again.`
  );
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

/** Said in the rail once the wallet has sent a proposal; the map opens it as soon as the inbox lists it. */
export const SUBMITTED_NOTICE =
  "Sent with your wallet. It appears here when the next Mirror Node poll confirms it — nothing on screen changes until then.";
