/**
 * The HTS token the council governs. Its pause and freeze keys are the `TokenAdmin` contract id,
 * and it is created without an admin key — which is what makes "pause the token" an act of
 * governance rather than a transaction someone signs, and also what makes it unrepairable: those
 * keys can never be changed, so a token outlives only the contracts it was created against.
 *
 * The demo freezes an account, and freezing needs a relation to freeze: the holder is associated
 * with the token and given a balance, or the operation would be refused
 * (`TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`) or invisible.
 */
import type { SetupStep, StepOutcome } from "./reconcile";
import type { DemoAccount, DemoAccountName, SetupState } from "./state";

export const DEMO_TOKEN = { name: "Governed Demo Token", symbol: "GOVD", initialSupply: 1_000 } as const;

/** The demo account that holds the token and gets frozen; the other one stays a pure co-signer. */
export const DEMO_TOKEN_HOLDER: DemoAccountName = "bob";

export const DEMO_TOKEN_HOLDER_BALANCE = 100;

export type DemoTokenLookups = {
  /** Contract id the token's pause key points at; undefined when the network does not know the token. */
  tokenPauseKeyContractId(tokenId: string): Promise<string | undefined>;
  accountHasToken(accountId: string, tokenId: string): Promise<boolean>;
  accountTokenBalance(accountId: string, tokenId: string): Promise<number>;
};

export type DemoTokenActions = {
  createDemoToken(tokenAdminContractId: string): Promise<string>;
  associateToken(account: DemoAccount, tokenId: string): Promise<void>;
  fundHolder(account: DemoAccount, tokenId: string, amount: number): Promise<void>;
};

export type DemoTokenServices = {
  lookups: DemoTokenLookups;
  actions: DemoTokenActions;
  /** Called with a freshly created token id, before its holder is settled, so a failure after that never orphans it. */
  persist?: (tokenId: string) => void;
};

export type DemoTokenResult = {
  tokenId: string;
  steps: SetupStep[];
};

function requireHolder(state: SetupState): DemoAccount {
  const holder = state.demoAccounts[DEMO_TOKEN_HOLDER];
  if (!holder) {
    throw new Error(
      `The demo token needs ${DEMO_TOKEN_HOLDER} to hold it and the state has no such account; ` +
        "it is created by the core reconcile, before this runs",
    );
  }
  return holder;
}

function requireSameTokenAdmin(tokenId: string, pauseKey: string, tokenAdminContractId: string): void {
  if (pauseKey === tokenAdminContractId) return;
  throw new Error(
    `Demo token ${tokenId} has its pause key on ${pauseKey}, and the TokenAdmin deployed now is ` +
      `${tokenAdminContractId}. A token created without an admin key can never have its keys changed, so this one ` +
      'cannot be governed by the current contracts. Remove "demoTokenId" from packages/nextjs/setup-state.json to ' +
      `create a replacement; ${tokenId} stays on testnet, unusable.`,
  );
}

async function reconcileToken(
  state: SetupState,
  tokenAdminContractId: string,
  services: DemoTokenServices,
): Promise<{ tokenId: string; outcome: StepOutcome }> {
  const existing = state.demoTokenId;
  const pauseKey = existing === undefined ? undefined : await services.lookups.tokenPauseKeyContractId(existing);

  if (existing !== undefined && pauseKey !== undefined) {
    requireSameTokenAdmin(existing, pauseKey, tokenAdminContractId);
    return { tokenId: existing, outcome: "reused" };
  }
  const tokenId = await services.actions.createDemoToken(tokenAdminContractId);
  services.persist?.(tokenId);
  return { tokenId, outcome: "created" };
}

async function reconcileHolder(
  holder: DemoAccount,
  token: { tokenId: string; outcome: StepOutcome },
  services: DemoTokenServices,
): Promise<SetupStep[]> {
  const { lookups, actions } = services;
  // A token created a moment ago has no holders and no Mirror Node entry worth reading.
  const fresh = token.outcome === "created";

  const associated = !fresh && (await lookups.accountHasToken(holder.accountId, token.tokenId));
  if (!associated) await actions.associateToken(holder, token.tokenId);

  const funded = associated && (await lookups.accountTokenBalance(holder.accountId, token.tokenId)) > 0;
  if (!funded) await actions.fundHolder(holder, token.tokenId, DEMO_TOKEN_HOLDER_BALANCE);

  return [
    { label: `Demo token association for ${DEMO_TOKEN_HOLDER}`, outcome: associated ? "reused" : "created" },
    { label: `Demo token balance for ${DEMO_TOKEN_HOLDER}`, outcome: funded ? "reused" : "created" },
  ];
}

export async function reconcileDemoToken(
  state: SetupState,
  tokenAdminContractId: string,
  services: DemoTokenServices,
): Promise<DemoTokenResult> {
  const holder = requireHolder(state);
  const token = await reconcileToken(state, tokenAdminContractId, services);

  return {
    tokenId: token.tokenId,
    steps: [
      { label: `Demo token ${token.tokenId}`, outcome: token.outcome },
      ...(await reconcileHolder(holder, token, services)),
    ],
  };
}
