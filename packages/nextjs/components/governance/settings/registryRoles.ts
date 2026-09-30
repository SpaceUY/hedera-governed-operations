/**
 * How Settings describes the registry's roles as read: by name when they are what the deployment set
 * up — the treasury account alone holding EXECUTOR_ROLE, the registry administering its own roles —
 * and as the addresses read otherwise, so the screen never claims more than the chain says.
 */
import { SETTINGS_COPY } from "./copy";
import type { Proposer } from "@sh/core/governance/council";
import { longZeroAddress } from "@sh/core/identity";
import type { SeatNaming } from "~~/components/governance/rail/councilSeats";

const sameAddress = (left: string, right: string): boolean => left.toLowerCase() === right.toLowerCase();

export type ExecutorHolders = { status: "treasuryOnly" } | { status: "others"; holders: string[] };

export function executorHoldersOf(executors: readonly string[], governanceAccountId: string): ExecutorHolders {
  const treasury = longZeroAddress(governanceAccountId);
  if (executors.length === 1 && sameAddress(executors[0], treasury)) return { status: "treasuryOnly" };
  return { status: "others", holders: [...executors] };
}

/** Whether every holder of the admin roles is this executor, named by its deployment address or its long-zero form. */
export function administersItself(
  admins: readonly string[],
  executor: { address: string; hederaContractId: string },
): boolean {
  const itself = [executor.address, longZeroAddress(executor.hederaContractId)];
  return admins.length > 0 && admins.every(admin => itself.some(address => sameAddress(admin, address)));
}

export function proposerNamesOf(
  proposers: readonly Proposer[],
  { viewerAccountId, memberNames = {} }: SeatNaming,
): string[] {
  return proposers.map(({ accountId, key }) => {
    if (accountId === viewerAccountId) return `${SETTINGS_COPY.roles.yourWallet} ${accountId}`;
    const name = key ? memberNames[key]?.name : undefined;
    return name ? `${name} ${accountId}` : accountId;
  });
}
