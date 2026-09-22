/**
 * Extension points for product-specific setup. The core script (`yarn setup`) creates what any
 * direction needs: an HCS topic, funded ECDSA demo accounts and their USDC association. Hooks
 * below run after the core reconcile, in order, with the final state. Implement one when the
 * product direction needs extra on-chain fixtures, keep it idempotent (check before creating, like
 * `reconcile`) and persist any new ids through `ctx.saveState`.
 */
import { reconcileDemoToken } from "./demoToken";
import { readGovernanceDeployment } from "./deployments";
import type { SetupEnv } from "./env";
import { upsertEnvFile } from "./envFile";
import { reconcileGovernance } from "./governance";
import { HARDHAT_ENV_PATH, hardhatEnvEntries } from "./hardhatEnv";
import { GOVERNANCE_LOW_BALANCE_HBAR, createGovernanceActions, createGovernanceLookups } from "./hederaGovernance";
import type { MirrorLookups } from "./reconcile";
import { formatSteps } from "./report";
import { reconcileSeedProposal } from "./seedProposal";
import type { SetupState } from "./state";
import type { Client } from "@hiero-ledger/sdk";
import deployedContracts from "~~/contracts/deployedContracts";

export type SetupContext = {
  env: SetupEnv;
  /** Operator client; already configured and closed by the entry point after the hooks run. */
  client: Client;
  /** Mirror Node reads, for verifying ids before re-creating anything. */
  lookups: MirrorLookups;
  /** State after the core reconcile (topic, demo accounts with keys). */
  state: SetupState;
  /** Persist a new state; the entry point writes the app env from whatever the hooks leave here. */
  saveState(next: SetupState): void;
};

/**
 * Governed-operations direction: the account holding the council's threshold key, the HTS token it
 * administers and the proposal the demo opens on.
 *
 * It runs in two passes, because the dependencies are circular and cross the workspace boundary.
 * The executor's constructor needs the governance account's address and the proposer list, and
 * neither exists before this hook creates the account; the demo token needs `TokenAdmin` already
 * deployed, because a token key that points at a contract can never be changed afterwards. So the
 * first run creates the account and hands those two values to `packages/hardhat/.env`, the deploy
 * runs, and the second run finishes the fixtures. Re-running after that creates nothing.
 */
export async function setupGovernance(ctx: SetupContext): Promise<void> {
  const { env, client, saveState } = ctx;
  const services = {
    lookups: createGovernanceLookups(env, client),
    actions: createGovernanceActions(env, client),
  };

  const { governance, proposers, step } = await reconcileGovernance(ctx.state, env, services);
  const withGovernance: SetupState = { ...ctx.state, governance };
  saveState(withGovernance);
  upsertEnvFile(HARDHAT_ENV_PATH, hardhatEnvEntries(governance, proposers));
  console.log(formatSteps([step]).join("\n"));

  const deployment = readGovernanceDeployment(deployedContracts);
  if (!deployment.ready) {
    console.log(deployNextMessage(deployment.missing).join("\n"));
    return;
  }

  const token = await reconcileDemoToken(withGovernance, deployment.deployment.tokenAdminContractId, {
    ...services,
    persist: demoTokenId => saveState({ ...withGovernance, demoTokenId }),
  });
  const withToken: SetupState = { ...withGovernance, demoTokenId: token.tokenId };
  saveState(withToken);

  const seed = await reconcileSeedProposal(withToken, deployment.deployment, services);
  saveState({ ...withToken, seedProposal: seed.seedProposal });

  console.log(formatSteps([...token.steps, seed.step]).join("\n"));
  await warnOnLowBalance(governance.accountId, services.lookups.accountHbarBalance);
}

function deployNextMessage(missing: string[]): string[] {
  return [
    "",
    `  Not deployed yet: ${missing.join(", ")}. The demo token and the first proposal need them.`,
    "  Deploy the contracts, then run this again:",
    "",
    "      yarn hardhat:deploy --network hederaTestnet",
    "      yarn setup",
    "",
  ];
}

/** The governance account pays for every approval, and a scheduled call is charged its whole gas limit. */
async function warnOnLowBalance(accountId: string, balanceOf: (accountId: string) => Promise<number>): Promise<void> {
  const balance = await balanceOf(accountId);
  if (balance >= GOVERNANCE_LOW_BALANCE_HBAR) return;
  console.log(
    `\n  Governance account ${accountId} is down to ${balance.toFixed(2)} HBAR. It pays for every approved ` +
      "proposal; top it up from the operator before running the demo.",
  );
}

/**
 * Merchant-rails direction: merchant account settings, DEX allowances, price feed fixtures.
 * Not implemented.
 */
export async function setupMerchant(ctx: SetupContext): Promise<void> {
  void ctx;
}
