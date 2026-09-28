/**
 * A registry entry this session registered and has not yet scheduled. Opening a contract-backed
 * proposal is two transactions, and the second can fail — rejected in the wallet, refused by the
 * network — after the first succeeded. Registering the same call again would leave two entries for
 * one decision, so a retry reuses this one and only schedules it.
 */
import type { RegistryProposal } from "@sh/core/governance/encode";

export type UnscheduledEntry = {
  executorContractId: string;
  /** The call the entry stores, which is what a retry has to match to reuse it. */
  target: string;
  calldata: string;
  /** The `createProposal` transaction, from which the entry's id is read. */
  registrationTransactionId: string;
  /** Null while Mirror has not yet recorded what the registration returned. */
  registryProposalId: number | null;
};

/** Whether `entry` already stores the call `proposal` would register on this executor. */
export function isEntryFor(
  entry: UnscheduledEntry | null,
  executorContractId: string,
  proposal: Pick<RegistryProposal, "target" | "calldata">,
): entry is UnscheduledEntry {
  if (!entry || entry.executorContractId !== executorContractId) return false;
  // An address may come back checksummed or not; the calldata is compared as bytes.
  return (
    entry.target.toLowerCase() === proposal.target.toLowerCase() &&
    entry.calldata.toLowerCase() === proposal.calldata.toLowerCase()
  );
}
