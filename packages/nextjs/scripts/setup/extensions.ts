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
import { AGENT_SEAT, type SetupState } from "./state";
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

  const releaseTopicId = await reconcileSignedTopic(ctx.state.releaseTopicId, "Release topic", {
    isSigned: services.lookups.topicIsSigned,
    create: services.actions.createReleaseTopic,
  });
  const decisionTopicId = await reconcileSignedTopic(ctx.state.decisionTopicId, "Agent decision topic", {
    isSigned: services.lookups.topicIsSigned,
    create: () => services.actions.createDecisionTopic(agentSeatPublicKey(ctx.state)),
  });
  const topics = { releaseTopicId, decisionTopicId };
  const { governance, proposers, step } = await reconcileGovernance({ ...ctx.state, ...topics }, env, services);
  const withGovernance: SetupState = { ...ctx.state, ...topics, governance };
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

/**
 * The two topics whose contents are only evidence if the network refuses everyone but their submit
 * key: the release manifests an upgrade is checked against, and the log the agent writes its
 * decisions to. Both are created before anything else here because neither depends on the contracts —
 * a template scaffolded today has somewhere to publish to on its very first release.
 *
 * Existing is not enough to reuse one, which is the one place this differs from every other fixture:
 * the topic has to still be one only its submit key can write to. A topic an earlier version of this
 * script created without one cannot be repaired — it has no admin key either — so the reconcile
 * replaces it rather than carrying a log anybody could have written.
 */
export async function reconcileSignedTopic(
  existing: string | undefined,
  subject: string,
  services: { isSigned(topicId: string): Promise<boolean>; create(): Promise<string> },
): Promise<string> {
  const reusable = existing !== undefined && (await services.isSigned(existing));
  const topicId = reusable ? existing : await services.create();
  const outcome = reusable ? "reused" : "created";
  if (!reusable && existing !== undefined) {
    console.log(`  ${subject} ${existing} takes messages from anyone; replacing it with a topic that does not.`);
  }
  console.log(formatSteps([{ label: `${subject} ${topicId}`, outcome }]).join("\n"));
  return topicId;
}

/** The demo account whose seat the agent votes with, and whose key holds the decision topic. */
function agentSeatPublicKey(state: SetupState): string {
  const seat = state.demoAccounts[AGENT_SEAT];
  if (!seat) {
    throw new Error(
      `The agent's decision topic is held by the key of demo account ${AGENT_SEAT} and the state has none; ` +
        "it is created by the core reconcile, before this runs",
    );
  }
  return seat.publicKey;
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
