/**
 * Idempotence core of the setup: compares the saved state with what the Mirror Node knows
 * and only runs the actions needed to fill the gaps. Network access is injected so the
 * decisions can be unit-tested.
 */
import { DEMO_ACCOUNT_NAMES, type DemoAccount, type DemoAccountName, type SetupState } from "./state";

export const USDC_TESTNET_TOKEN_ID = "0.0.5449";

export type MirrorLookups = {
  accountExists(accountId: string): Promise<boolean>;
  accountHasToken(accountId: string, tokenId: string): Promise<boolean>;
};

export type SetupActions = {
  createDemoAccount(name: DemoAccountName): Promise<DemoAccount>;
  associateToken(account: DemoAccount, tokenId: string): Promise<void>;
};

export type SetupServices = {
  lookups: MirrorLookups;
  actions: SetupActions;
  /** Called after every entity is settled so a failure later in the run never orphans what was already created. */
  persist?: (state: SetupState) => void;
};

export type StepOutcome = "created" | "reused";

export type SetupStep = {
  label: string;
  outcome: StepOutcome;
};

export type ReconcileResult = {
  state: SetupState;
  steps: SetupStep[];
};

async function reuseOrCreate<T>(
  existing: T | undefined,
  verify: (value: T) => Promise<boolean>,
  create: () => Promise<T>,
): Promise<{ value: T; outcome: StepOutcome }> {
  if (existing !== undefined && (await verify(existing))) return { value: existing, outcome: "reused" };
  return { value: await create(), outcome: "created" };
}

async function reconcileAssociation(
  account: DemoAccount,
  name: DemoAccountName,
  services: SetupServices,
): Promise<SetupStep> {
  const outcome: StepOutcome = (await services.lookups.accountHasToken(account.accountId, USDC_TESTNET_TOKEN_ID))
    ? "reused"
    : "created";
  if (outcome === "created") await services.actions.associateToken(account, USDC_TESTNET_TOKEN_ID);
  return { label: `USDC association for ${name}`, outcome };
}

async function reconcileDemoAccount(
  state: SetupState,
  name: DemoAccountName,
  services: SetupServices,
): Promise<ReconcileResult> {
  const { value: account, outcome } = await reuseOrCreate(
    state.demoAccounts[name],
    existing => services.lookups.accountExists(existing.accountId),
    () => services.actions.createDemoAccount(name),
  );
  const accountStep: SetupStep = { label: `Demo account ${name} ${account.accountId}`, outcome };
  const withAccount = { ...state, demoAccounts: { ...state.demoAccounts, [name]: account } };
  services.persist?.(withAccount);

  const associationStep =
    outcome === "created"
      ? await associateFresh(account, name, services)
      : await reconcileAssociation(account, name, services);

  return { state: withAccount, steps: [accountStep, associationStep] };
}

/** A just-created account is not on the Mirror Node yet, so the association is done without looking it up. */
async function associateFresh(
  account: DemoAccount,
  name: DemoAccountName,
  services: SetupServices,
): Promise<SetupStep> {
  await services.actions.associateToken(account, USDC_TESTNET_TOKEN_ID);
  return { label: `USDC association for ${name}`, outcome: "created" };
}

export async function reconcile(initial: SetupState, services: SetupServices): Promise<ReconcileResult> {
  let result: ReconcileResult = { state: initial, steps: [] };
  for (const name of DEMO_ACCOUNT_NAMES) {
    const next = await reconcileDemoAccount(result.state, name, services);
    result = { state: next.state, steps: [...result.steps, ...next.steps] };
  }
  return result;
}
