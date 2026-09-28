import { type ProposalKind, isContractProposalKind } from "./proposalTypes";
import type { Proposal } from "./proposals";

type SignableFacts = Pick<Proposal, "state" | "operation" | "registry">;

/**
 * A council member is only asked to sign a proposal the app can vouch for: a native kind (no
 * registry entry), or a registry call whose entry is still pending and decodes to an operation this
 * template knows. A missing, cancelled, unreadable or unrecognised entry gets no Sign button, and
 * neither does an entry the relay could not be asked about.
 */
export function canBeSigned({ state, operation, registry }: SignableFacts): boolean {
  if (state.status !== "pending") return false;
  if (operation.kind === "treasuryTransfer" || operation.kind === "councilRotation") {
    return registry.status === "notApplicable";
  }
  if (operation.kind !== "registryCall") return false;
  return (
    registry.status === "read" && registry.entry.state === "pending" && registry.entry.operation.kind !== "unrecognized"
  );
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
