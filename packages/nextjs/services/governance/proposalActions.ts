import { type ProposalKind, isContractProposalKind } from "@sh/core/governance/proposalTypes";
import type { Proposal } from "@sh/core/governance/proposals";

type SignableFacts = Pick<Proposal, "state" | "operation" | "registry">;

/** A registry entry the app can vouch for: read, still pending, and decoding to a known operation. */
function isVouchedEntry(registry: Proposal["registry"]): boolean {
  return (
    registry.status === "read" && registry.entry.state === "pending" && registry.entry.operation.kind !== "unrecognized"
  );
}

/** Whether an `unreachable` registry read is treated as vouched-for too, or held to the strict rule. */
type VouchLevel = "vouchedOnly" | "vouchedOrUnreachable";

/**
 * The gate both `canBeSigned` and `canShowIntent` share: a native kind needs no registry entry, a
 * contract-backed kind needs a registry call, and `level` decides whether a relay that could not be
 * asked (`unreachable`) still counts.
 */
function isSignableOperation({ state, operation, registry }: SignableFacts, level: VouchLevel): boolean {
  if (state.status !== "pending") return false;
  if (operation.kind === "treasuryTransfer" || operation.kind === "councilRotation") {
    return registry.status === "notApplicable";
  }
  if (operation.kind !== "registryCall") return false;
  if (isVouchedEntry(registry)) return true;
  return level === "vouchedOrUnreachable" && registry.status === "unreachable";
}

/**
 * A council member is only asked to sign a proposal the app can vouch for, or one it simply could not
 * check just now: a native kind (no registry entry), a registry call whose entry is still pending and
 * decodes to an operation this template knows, or a registry call the relay could not be asked about
 * (`unreachable`) — the network is the final check either way, so a transient read failure is a
 * warning, not a lock. A missing, cancelled or unrecognised entry still gets no Sign button.
 */
export function canBeSigned(facts: SignableFacts): boolean {
  return isSignableOperation(facts, "vouchedOrUnreachable");
}

/**
 * Whether the map may draw the operation's route as an intent edge. Stricter than `canBeSigned`: an
 * `unreachable` read lets a person decide to sign anyway, but the app still cannot say what the entry
 * currently holds — it may have been cancelled or executed since the last successful read — so a
 * preview drawn from it would claim to know something the app cannot back up.
 */
export function canShowIntent(facts: SignableFacts): boolean {
  return isSignableOperation(facts, "vouchedOnly");
}

/**
 * Only the proposer can withdraw: their key is the schedule's admin key, and the one who created the
 * schedule is the one whose key was named there. Offering it to anyone else is a wallet prompt the
 * network then refuses.
 */
export function canBeWithdrawnBy(
  { schedule, state }: Pick<Proposal, "schedule" | "state">,
  accountId: string | null,
): boolean {
  return state.status === "pending" && accountId !== null && schedule.creator_account_id === accountId;
}

/**
 * Opening a native proposal needs only an account to pay for the schedule. A contract-backed one is
 * registered first, and `createProposal` reverts for an account without `PROPOSER_ROLE` — after
 * charging the fee — so the screen does not offer it.
 */
export function canOpenProposal(kind: ProposalKind, accountId: string | null, proposerAccountIds: string[]): boolean {
  if (accountId === null) return false;
  if (!isContractProposalKind(kind)) return true;
  return proposerAccountIds.includes(accountId);
}

/**
 * The registry entry a Cancel button retires, or null when there is none to offer. Only once no live
 * schedule points at the entry any more — it was withdrawn, it expired, or it ran and failed, since a
 * schedule runs once — and the entry is still pending. Cancelling under a live schedule would leave
 * it to reach its threshold, revert with `ProposalNotPending` and bill the governance account.
 */
export function cancellableRegistryId({
  state,
  execution,
  registry,
}: Pick<Proposal, "state" | "execution" | "registry">): number | null {
  if (registry.status !== "read" || registry.entry.state !== "pending") return null;
  const scheduleIsDone = state.status === "deleted" || state.status === "expired" || execution.status === "failed";
  return scheduleIsDone ? registry.entry.proposalId : null;
}

/**
 * Another schedule of the inbox still collecting signatures for the same registry entry, or null.
 * Anyone can schedule `execute(id)` again, so a withdrawn round does not mean the entry is free:
 * cancelling under that other schedule would leave it to reach its threshold, revert with
 * `ProposalNotPending` and bill the governance account. A pending round on this registry reads as
 * `read`, or `unreachable` when the relay could not be asked — counted too, since it cannot be ruled
 * out. Only schedules the inbox lists are known: one opened by an account outside the proposer list
 * is not.
 */
export function otherOpenScheduleOf(
  { schedule, registry }: Pick<Proposal, "schedule" | "registry">,
  inbox: readonly Pick<Proposal, "schedule" | "state" | "operation" | "registry">[],
): string | null {
  if (registry.status !== "read") return null;
  const other = inbox.find(
    candidate =>
      candidate.schedule.schedule_id !== schedule.schedule_id &&
      candidate.state.status === "pending" &&
      candidate.operation.kind === "registryCall" &&
      candidate.operation.proposalId === registry.entry.proposalId &&
      (candidate.registry.status === "read" || candidate.registry.status === "unreachable"),
  );
  return other?.schedule.schedule_id ?? null;
}

/**
 * Whether the connected account may call `GovernedExecutor.cancel` on this entry: `cancel` is open
 * to the entry's own proposer and to any `EXECUTOR_ROLE` holder — in this template, only ever the
 * governance account — and to nobody else. That is not the schedule's creator: the two are the same
 * account in this app's own flow (one wallet both registers the entry and creates the schedule
 * wrapping its execution), but nothing enforces that in general, so the button authorizes against
 * the registry entry's own `proposer`, the contract's ground truth, rather than inferring it from
 * the schedule. Addresses are compared case-insensitively, since a decoded one comes back EIP-55
 * checksummed whatever casing the call carried, and Mirror's `evm_address` does not.
 */
export function canCancelRegistryEntry(
  entryProposer: string,
  accountEvmAddress: string | null,
  governanceEvmAddress: string | null,
): boolean {
  if (!accountEvmAddress) return false;
  const account = accountEvmAddress.toLowerCase();
  if (account === entryProposer.toLowerCase()) return true;
  return governanceEvmAddress !== null && account === governanceEvmAddress.toLowerCase();
}
