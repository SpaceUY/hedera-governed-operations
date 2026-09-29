/**
 * The words the rail uses around a proposal: its card, the detail under it (steps, signatures, the
 * council's rows, HashScan, the result) and Withdraw / Cancel. What a proposal's status, registry entry
 * or approvals are called — the same on every screen — lives in `services/governance/proposalLabels`;
 * a kind's title in `components/governance/wizard/copy`; the map's words in `components/governance/graph/copy`.
 */
import { type ProposalStage, remainingSignatures } from "./proposalProgress";
import type { Proposal } from "@sh/core/governance/proposals";
import { proposalStatusLabel } from "~~/services/governance/proposalLabels";

export type ProposalFamily = "contract" | "native";

/** A span of time the way the rail writes it: "6d 21h", "3h 5m", "12m". */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** A pending proposal's time left, on its card and in its detail. */
export const EXPIRY_COPY = {
  expiringNow: "Expiring now",
  left: (duration: string) => `${duration} left`,
} as const;

/** The pending list's fold. */
export const PENDING_LIST_COPY = {
  showMore: (hidden: number) => `Show ${hidden} more`,
  showFewer: "Show fewer",
} as const;

/** The search that finds any proposal by its schedule id, listed or not. */
export const SEARCH_COPY = {
  label: "Find a proposal by schedule id",
  button: "Find",
  notAScheduleId: (term: string) => `"${term}" doesn't look like a schedule id (expected 0.0.x).`,
  lookingUp: (scheduleId: string) => `Looking up ${scheduleId}`,
  notFound: (scheduleId: string) => `No proposal found for ${scheduleId}.`,
} as const;

type StageFacts = Pick<Proposal, "state" | "execution" | "progress" | "incomingProgress">;

/** The card's one-line family, and the detail's longer one. */
export const FAMILY_COPY: Record<ProposalFamily, { card: string; detail: string }> = {
  contract: { card: "contract · via registry", detail: "Contract operation · goes through the registry" },
  native: { card: "native · no registry", detail: "Native operation · no registry entry, no event" },
};

const signaturesWord = (count: number) => (count === 1 ? "signature" : "signatures");

function isEntryCancelled({ registry }: Pick<Proposal, "registry">): boolean {
  return registry.status === "read" && registry.entry.state === "cancelled";
}

/**
 * A card's status: while signatures are being collected, how many more it needs; once settled, how it
 * ended. A registry entry cancelled under the schedule is said too — a withdrawn round alone leaves it
 * pending, and it is the entry that decides whether anything can still run.
 */
export function cardStatusLabel(proposal: StageFacts & Pick<Proposal, "registry">): string {
  const status =
    proposal.state.status === "pending"
      ? pendingStatusLabel(remainingSignatures(proposal))
      : proposalStatusLabel(proposal);
  return isEntryCancelled(proposal) ? `${status} · entry cancelled` : status;
}

function pendingStatusLabel(remaining: number): string {
  return remaining > 0 ? `${remaining} more needed` : "Threshold reached";
}

/** What the three dots on a card say to a screen reader. */
export function stagesAriaLabel(proposal: StageFacts): string {
  if (proposal.state.status === "executed") return `Created, signed by the council. ${proposalStatusLabel(proposal)}.`;
  if (proposal.state.status !== "pending") return `Created, then ${proposalStatusLabel(proposal).toLowerCase()}.`;
  const remaining = remainingSignatures(proposal);
  return `Created. ${remaining} more ${signaturesWord(remaining)} needed. Not executed.`;
}

const ORDINAL_SUFFIXES = new Intl.PluralRules("en-US", { type: "ordinal" });
const SUFFIX_OF: Record<string, string> = { one: "st", two: "nd", few: "rd", other: "th" };

function ordinal(position: number): string {
  return `${position}${SUFFIX_OF[ORDINAL_SUFFIXES.select(position)]}`;
}

/**
 * The line under each step of the detail. Registering and scheduling are the proposer's, and neither
 * is a council vote; the network, not a button, runs it at the threshold.
 */
export function stageLines(facts: StageFacts, family: ProposalFamily, rule: string): Record<ProposalStage, string> {
  const { status } = facts.state;
  const remaining = remainingSignatures(facts);
  const create =
    family === "contract"
      ? "Registered and scheduled by the proposer. Not a council vote."
      : "Scheduled by the proposer. No registry entry, no event.";
  const sign =
    status === "executed"
      ? `The ${rule} council signed`
      : status === "pending"
        ? `${remaining} more ${signaturesWord(remaining)} needed, in any order`
        : `${proposalStatusLabel(facts)} before the threshold`;
  return { create, sign, executed: executedLine(facts) };
}

function executedLine({ state, execution, progress }: StageFacts): string {
  if (state.status === "pending") {
    return `Runs by itself at the ${ordinal(progress.threshold)} signature. No execute button.`;
  }
  if (state.status !== "executed") return "Never ran";
  if (execution.status === "succeeded") return "Ran by itself at the last signature";
  if (execution.status === "failed") return "Reverted: nothing changed";
  return "Ran; confirming the result";
}

export const STAGE_TITLES: Record<ProposalStage, string> = {
  create: "Create",
  sign: "Sign",
  executed: "Executed",
};

/**
 * The large signature line: how many more are needed while there are any, otherwise where it ended —
 * next to the council's rule and how many have signed.
 */
export function signatureHeadline(facts: StageFacts): { count: number | null; words: string } {
  const remaining = remainingSignatures(facts);
  if (facts.state.status === "pending" && remaining > 0) {
    return { count: remaining, words: `more ${signaturesWord(remaining)} needed` };
  }
  if (facts.state.status === "pending") return { count: null, words: "Threshold reached" };
  return { count: null, words: proposalStatusLabel(facts) };
}

export const signatureSubline = (rule: string, signed: number) => `${rule} council · ${signed} signed`;

/** How a pending proposal ends, since there is no button that ends it — said once, in the detail. */
export function noRejectNote(expiresAt: Date | null, now: Date = new Date()): { lead: string; rest: string } {
  const lead = "There is no reject button.";
  const sign = "On Hedera you sign or you don't.";
  if (!expiresAt) return { lead, rest: `${sign} A proposal nobody signs in time expires, and nothing runs.` };
  const left = formatDuration(expiresAt.getTime() - now.getTime());
  return {
    lead,
    rest: `${sign} If nobody signs, this schedule expires on its own — ${left} from now, and nothing runs.`,
  };
}

export const ROTATION_NOTE =
  "Replacing the council needs signatures from both sides: the current council's threshold and the " +
  "incoming council's own.";

/** On the viewer's incoming-council row when it also sits in the current one: one signature counts for both. */
export const ROTATION_ONE_SIGNATURE = "Signing above counts here too";

export const COUNCIL_HEADINGS = {
  single: "Council",
  current: "Current council",
  incoming: "Incoming council",
} as const;

export const MEMBER_COPY = {
  you: "You",
  yourWallet: "your wallet",
  signed: "Signed",
  notYet: "Not yet",
  didNotSign: "Didn't sign",
} as const;

/** The co-signing agent in the council list: its own seat's name, or the row saying it has none yet. */
export const AGENT_COPY = {
  name: "Co-signing agent",
  monogram: "AG",
  notMember: "not a member",
  notSeated: "not seated",
  /** `rule` is the council the agent's seat would make, the current threshold over one more member. */
  howToSeat: (rule: string) => `Approve “Add the co-signing agent” to seat it (${rule} council).`,
} as const;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SIGNED_DATE_FORMAT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

/** "3h ago", in the largest whole unit: seconds, minutes, hours, then days. */
function agoLabel(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  const days = Math.floor(seconds / 86_400);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** When a member's signature landed: how long ago within a week, the short date after that. */
export function signedWhenLabel(signedAt: Date, now: Date = new Date()): string {
  const elapsed = now.getTime() - signedAt.getTime();
  if (elapsed >= WEEK_MS) return `Signed ${signedAt.toLocaleDateString(undefined, SIGNED_DATE_FORMAT)}`;
  return `Signed ${agoLabel(elapsed)}`;
}

/** The signature link's accessible name, which says where it goes. */
export const signedWhenAriaLabel = (name: string, when: string) =>
  `${name}: ${when.charAt(0).toLowerCase()}${when.slice(1)} — open the signature on HashScan`;

/** The Sign button names the signer that will be asked, so a council member knows where to look. */
export const SIGN_LABELS = {
  hashpack: "Sign with HashPack",
  burner: "Sign with the test signer",
} as const;

export const HASHSCAN_COPY = {
  heading: "On HashScan",
  resultHeading: "Result",
  schedule: (scheduleId: string) => `Schedule ${scheduleId}`,
  /** The schedule's state as HashScan itself spells it. */
  scheduleTag: { pending: "active", executed: "executed", deleted: "deleted", expired: "expired" },
  created: (creator: string) => `Scheduled by ${creator}`,
  executed: (result: string) => `Scheduled transaction · ${result}`,
} as const;

const RESULT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/** What an executed proposal did, beside its HashScan links. */
export function executedResult(executedAt: Date | null, result: string) {
  const when = executedAt ? ` at ${executedAt.toLocaleString(undefined, RESULT_DATE_FORMAT)}` : "";
  return {
    title: "Executed",
    line: `Executed by the network${when}. Status ${result}, fee paid by the treasury.`,
    why: "It ran by itself the moment the last signature landed. Nobody pressed execute.",
  };
}

/** What a proposal that did not run left behind, or null while it is live or once it ran. */
export function endNote(proposal: Pick<Proposal, "state" | "registry" | "operation">): string | null {
  const { state, registry, operation } = proposal;
  if (state.status === "pending" || state.status === "executed") return null;
  if (isEntryCancelled(proposal)) return "Cancelled for good. Nothing can run it now.";
  if (operation.kind === "registryCall" && registry.status === "read" && registry.entry.state === "pending") {
    return "This approval round is over, but the proposal is still registered. Anyone can schedule it again.";
  }
  if (state.status === "deleted")
    return "Withdrawn: the schedule was deleted, and a native operation has nothing else to end.";
  return "Expired unsigned. Nothing happened.";
}

export const WITHDRAW_COPY = {
  button: "Withdraw my approval round",
  why: {
    contract: "Deletes this schedule only. The proposal stays registered; anyone can schedule it again.",
    native: "Deletes the schedule. A native operation has no registry entry, so this ends it.",
  },
  nativeNoCancel:
    "No “cancel” here: a native operation has no registry entry, so deleting its schedule is the whole story.",
} as const;

export const CANCEL_COPY = {
  button: "Cancel this proposal",
  whyLive: "Ends it for good. The live schedule is deleted first, so it cannot revert later and burn treasury gas.",
  whyAlone: "Ends it for good. No schedule to delete, no signatures needed.",
  twoSteps: {
    title: "Two transactions, in this order",
    steps: [
      "Withdraw the approval round — delete the live schedule.",
      "Cancel the proposal in the registry — ends it for good.",
    ],
    why: (threshold: number) =>
      `Why this order: a schedule left alive after cancelling can still reach ${threshold} ${signaturesWord(threshold)} ` +
      "later. It would revert, and the treasury would still pay for the gas it burned.",
    confirm: "Delete schedule, then cancel",
  },
  oneStep: { title: "Cancel this proposal for good?", confirm: "Confirm cancel" },
  keep: "Keep it",
  progress: {
    withdrawing: "Step 1 of 2 — approve deleting the schedule in your wallet.",
    confirmingWithdraw: "Step 1 of 2 — confirming the delete on the network before asking for the cancel…",
    cancellingAfterWithdraw: "Step 2 of 2 — approve the cancel in your wallet.",
    cancelling: "Approve the cancel in your wallet.",
  },
  withdrawnNotCancelled: {
    text: "The schedule was withdrawn, but the registry entry is not cancelled yet: anyone could still schedule it again.",
    button: "Cancel the registry entry",
  },
  /** Shown in place of Cancel while another schedule for the same entry could still reach its threshold. */
  blockedByOpenSchedule:
    "Another schedule for this entry is still collecting signatures. It has to be withdrawn or expire before " +
    "the entry can be cancelled:",
  /** Shown in place of Cancel to whoever `GovernedExecutor.cancel` would refuse. */
  unauthorized: "Only the account that registered this entry, or the governance account, can cancel it.",
  /** Shown to an account that may cancel the entry but cannot delete the live schedule in front of it. */
  afterTheRound:
    "Only the account that created this schedule can delete it. Cancel is offered here once it is withdrawn or expires.",
  checking: "Checking who can cancel",
} as const;

/**
 * The dialog shown instead of the wallet prompt when an action would send a `ScheduleDelete` and the
 * connected wallet is known to refuse one (`signsScheduleDelete`): the refusal would otherwise arrive
 * as an ordinary rejection, as if the person had pressed Reject.
 */
export const WALLET_LIMIT_COPY = {
  title: "HashPack cannot sign this step",
  withdraw:
    "Withdrawing deletes this schedule, and HashPack cannot sign a schedule delete yet. Connect a wallet that supports it, such as Kabila, to withdraw this round.",
  cancelLive:
    "Cancelling deletes the open schedule first, and HashPack cannot sign that step yet. Connect a wallet that supports it, such as Kabila, to cancel this proposal.",
  useAnotherWallet: "Use another wallet",
  close: "Close",
} as const;

export const DETAIL_COPY = {
  loading: "Loading proposal",
  notFound: "Proposal not found.",
  kicker: (scheduleId: string) => `Proposal ${scheduleId}`,
  routeLabel: "Path it travels",
  rawSummary: "Raw ids, function and calldata",
  raw: {
    scheduleId: "Schedule id",
    registryEntry: "Registry entry",
    function: "Function",
    gas: "Gas limit",
    hbar: "HBAR sent by the treasury",
    status: "Status",
    creator: "Created by",
    payer: "Paid by",
    expires: "Expires",
    body: "Scheduled body (base64)",
  },
  entryIn: (proposalId: number, executorContractId: string, state: string) =>
    `#${proposalId} in ${executorContractId} · ${state}`,
  noEntry: "None — native, the network runs it directly",
  executeCall: (proposalId: number) => `execute(${proposalId}) on the registry`,
  nativeCall: "None — a native transaction, no contract call",
} as const;
