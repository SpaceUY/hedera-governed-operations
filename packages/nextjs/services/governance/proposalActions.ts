import { type ProposalKind, isContractProposalKind } from "@sh/core/governance/proposalTypes";
import type { Proposal } from "@sh/core/governance/proposals";

type SignableFacts = Pick<Proposal, "state" | "operation" | "registry">;

/** A registry entry the app can vouch for: read, still pending, and decoding to a known operation. */
function isVouchedEntry(registry: Proposal["registry"]): boolean {
  return (
    registry.status === "read" && registry.entry.state === "pending" && registry.entry.operation.kind !== "unrecognized"
  );
}

/**
 * A council member is only asked to sign a proposal the app can vouch for, or one it simply could not
 * check just now: a native kind (no registry entry), a registry call whose entry is still pending and
 * decodes to an operation this template knows, or a registry call the relay could not be asked about
 * (`unreachable`) — the network is the final check either way, so a transient read failure is a
 * warning, not a lock. A missing, cancelled or unrecognised entry still gets no Sign button.
 */
export function canBeSigned({ state, operation, registry }: SignableFacts): boolean {
  if (state.status !== "pending") return false;
  if (operation.kind === "treasuryTransfer" || operation.kind === "councilRotation") {
    return registry.status === "notApplicable";
  }
  if (operation.kind !== "registryCall") return false;
  return isVouchedEntry(registry) || registry.status === "unreachable";
}

/**
 * Whether the map may draw the operation's route as an intent edge. Stricter than `canBeSigned`: an
 * `unreachable` read lets a person decide to sign anyway, but the app still cannot say what the entry
 * currently holds — it may have been cancelled or executed since the last successful read — so a
 * preview drawn from it would claim to know something the app cannot back up.
 */
export function canShowIntent({ state, operation, registry }: SignableFacts): boolean {
  if (state.status !== "pending") return false;
  if (operation.kind === "treasuryTransfer" || operation.kind === "councilRotation") {
    return registry.status === "notApplicable";
  }
  if (operation.kind !== "registryCall") return false;
  return isVouchedEntry(registry);
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
