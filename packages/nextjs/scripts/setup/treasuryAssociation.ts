/**
 * The token a treasury swap pays out, associated on the governance account before a proposal needs it.
 *
 * Unlimited automatic associations are not enough, and the difference is gas rather than permission.
 * When the association happens *inside* a contract call, the HTS system contract charges the
 * association fee to that call as gas: measured on testnet, the pool's USDC payout was handed
 * 169,373 gas, consumed all of it and returned `INSUFFICIENT_GAS`, so the swap reverted with the
 * pool's own `TransferFail(21)`. With the token already associated the same transfer costs 15,284.
 *
 * It belongs outside the call for a second reason. A scheduled call that succeeds is charged its
 * whole gas limit, so a limit wide enough to cover a one-time association would make every swap
 * after it pay for one too.
 */
import { GOVERNANCE_THRESHOLD, demoCouncilMembers } from "./governance";
import type { SetupStep } from "./reconcile";
import type { DemoAccount, GovernanceAccount, SetupState } from "./state";

export type TreasuryAssociationLookups = {
  accountHasToken(accountId: string, tokenId: string): Promise<boolean>;
};

export type TreasuryAssociationActions = {
  /**
   * Associates `tokenId` on the governance account. That account's key is the council's threshold
   * key, so the operator pays for the transaction and council members authorise it — the same split
   * as every approved proposal.
   */
  associateGovernanceToken(governanceAccountId: string, tokenId: string, signers: DemoAccount[]): Promise<void>;
};

export type TreasuryAssociationServices = {
  lookups: TreasuryAssociationLookups;
  actions: TreasuryAssociationActions;
};

function requireGovernanceAccount(state: SetupState): GovernanceAccount {
  if (state.governance) return state.governance;
  throw new Error(
    "The treasury's token association is made on the governance account and the state has none; " +
      "it is created earlier in this hook, before this runs",
  );
}

/**
 * The council seats whose keys this script holds. They are the two demo accounts, which is exactly
 * `GOVERNANCE_THRESHOLD`: the third seat is the wallet of whoever installs the template, and setup
 * has no way to ask it for a signature. Raising the threshold past the number of demo seats would
 * leave this refused with `INVALID_SIGNATURE`, and the association would have to be made by hand.
 */
function councilSigners(state: SetupState): DemoAccount[] {
  return demoCouncilMembers(state).slice(0, GOVERNANCE_THRESHOLD);
}

const associationLabel = (tokenId: string) => `Treasury association for token ${tokenId}`;

export async function reconcileTreasuryAssociation(
  state: SetupState,
  tokenId: string,
  services: TreasuryAssociationServices,
): Promise<SetupStep> {
  const governance = requireGovernanceAccount(state);
  if (await services.lookups.accountHasToken(governance.accountId, tokenId)) {
    return { label: associationLabel(tokenId), outcome: "reused" };
  }
  return associateFreshTreasury(state, tokenId, services.actions);
}

/**
 * A governance account created in this same run is not on the Mirror Node yet — its token list
 * answers 404 for a few seconds — so the association is made without looking it up. Only an
 * account found in the state goes through `reconcileTreasuryAssociation`, where a 404 means
 * something is wrong rather than late.
 */
export async function associateFreshTreasury(
  state: SetupState,
  tokenId: string,
  actions: TreasuryAssociationActions,
): Promise<SetupStep> {
  const governance = requireGovernanceAccount(state);
  await actions.associateGovernanceToken(governance.accountId, tokenId, councilSigners(state));
  return { label: associationLabel(tokenId), outcome: "created" };
}
