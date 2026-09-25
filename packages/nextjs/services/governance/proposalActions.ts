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
