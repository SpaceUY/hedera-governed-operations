import { type ProposalKind, isContractProposalKind } from "@sh/core/governance/proposalTypes";
import type { Proposal } from "@sh/core/governance/proposals";

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
