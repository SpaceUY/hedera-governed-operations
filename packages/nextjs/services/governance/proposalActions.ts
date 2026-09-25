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
