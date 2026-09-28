/**
 * The account that holds the council's key. Everything else in this direction hangs off it: the
 * executor grants it `EXECUTOR_ROLE` at deployment, and a proposal only runs once m of its n
 * members have signed the scheduled transaction that wraps the call.
 *
 * Creating it belongs to the setup script rather than to a deploy script because it is a native
 * account with a `KeyList` key, built with the Hiero SDK; the contracts that depend on it are
 * deployed afterwards, through the JSON-RPC relay, with its address as a constructor argument.
 */
import type { SetupEnv } from "./env";
import type { SetupStep } from "./reconcile";
import { DEMO_ACCOUNT_NAMES, type GovernanceAccount, type SetupState } from "./state";

/** Signatures needed out of the three members: the human plus one of the demo accounts. */
export const GOVERNANCE_THRESHOLD = 2;

export type AccountIdentity = { publicKey: string; evmAddress: string };

export type GovernanceLookups = {
  accountExists(accountId: string): Promise<boolean>;
  accountIdentity(accountId: string): Promise<AccountIdentity>;
};

export type GovernanceActions = {
  /** Creates the account whose key is these members, m-of-n, with unlimited token associations. */
  createGovernanceAccount(memberPublicKeys: string[]): Promise<Omit<GovernanceAccount, "councilAccountId">>;
};

export type GovernanceServices = {
  lookups: GovernanceLookups;
  actions: GovernanceActions;
};

export type GovernanceResult = {
  governance: GovernanceAccount;
  /**
   * Addresses for `INITIAL_PROPOSERS`. The role is granted in the executor's constructor and its
   * admin is the contract itself, so this list is the only chance to hand it out without a
   * proposal that has already cleared the threshold.
   */
  proposers: string[];
  step: SetupStep;
};

/** The council seats this script holds the keys for, in a fixed order, both of them required. */
export function demoCouncilMembers(state: SetupState) {
  const accounts = DEMO_ACCOUNT_NAMES.map(name => state.demoAccounts[name]);
  if (accounts.some(account => account === undefined)) {
    throw new Error(
      `The threshold key needs the demo accounts (${DEMO_ACCOUNT_NAMES.join(", ")}) and the state has none; ` +
        "they are created by the core reconcile, before this runs",
    );
  }
  return accounts as NonNullable<(typeof accounts)[number]>[];
}

/**
 * A threshold key can only be replaced by a transaction that already meets the threshold, so an
 * account whose members no longer match the configuration cannot be brought back in line.
 */
function requireSameCouncil(existing: GovernanceAccount, councilAccountId: string): void {
  if (existing.councilAccountId === councilAccountId) return;
  throw new Error(
    `The governance account ${existing.accountId} holds a key built for council member ${existing.councilAccountId}, ` +
      `and HEDERA_COUNCIL_ACCOUNT_ID is now ${councilAccountId}. That key cannot be changed without the council it ` +
      "protects, and every contract is deployed against the account's address: a different member means a new " +
      "governance account and a fresh deployment. Delete packages/nextjs/setup-state.json to start over.",
  );
}

async function requireCouncilAccount(councilAccountId: string, lookups: GovernanceLookups): Promise<void> {
  if (await lookups.accountExists(councilAccountId)) return;
  throw new Error(
    `HEDERA_COUNCIL_ACCOUNT_ID is ${councilAccountId}, which does not exist on testnet. Use the account id of the ` +
      "wallet you will approve proposals with, in 0.0.xxxxx form.",
  );
}

const distinct = (addresses: string[]): string[] => [
  ...new Map(addresses.map(address => [address.toLowerCase(), address])).values(),
];

export async function reconcileGovernance(
  state: SetupState,
  env: SetupEnv,
  services: GovernanceServices,
): Promise<GovernanceResult> {
  const { lookups, actions } = services;
  const [alice, bob] = demoCouncilMembers(state);
  if (state.governance) requireSameCouncil(state.governance, env.councilAccountId);

  await requireCouncilAccount(env.councilAccountId, lookups);
  const council = await lookups.accountIdentity(env.councilAccountId);
  const operator = await lookups.accountIdentity(env.operatorId);

  const existing = state.governance;
  const reused = existing !== undefined && (await lookups.accountExists(existing.accountId));
  const governance: GovernanceAccount = reused
    ? (existing as GovernanceAccount)
    : {
        ...(await actions.createGovernanceAccount([council.publicKey, alice.publicKey, bob.publicKey])),
        councilAccountId: env.councilAccountId,
      };

  return {
    governance,
    proposers: distinct([council.evmAddress, operator.evmAddress, alice.evmAddress, bob.evmAddress]),
    step: {
      label: `Governance account ${governance.accountId} (${GOVERNANCE_THRESHOLD}-of-3)`,
      outcome: reused ? "reused" : "created",
    },
  };
}
