/**
 * `yarn harness:council-seat` — gives the Hedera Harness test signer a seat on the council.
 *
 * The CHAIN stage provisions a fresh funded ECDSA account for each run and hands its key to the
 * app, which is enough to pay for a transaction but not to approve a proposal: a `ScheduleSign`
 * only counts if the key is part of the governance account's threshold key, and the network answers
 * INVALID_SIGNATURE otherwise. This script closes that gap so the CHAIN assertion can grade the
 * real journey instead of an affordance.
 *
 * `.harness/validators/playwright-smoke.yaml` runs it in front of the dev server, because that
 * command is the only hook both harness entry points share. `chainValidation.deploy.commands` would
 * be the obvious home and is the wrong one: it is reached from `runValidationStages`, which
 * `validate-semantic` never calls — that path goes straight from provisioning the signer to booting
 * the server — so a seat declared there happens under `harness:run` and nowhere else.
 *
 * So the signer is found two ways: `HARNESS_SIGNER_ACCOUNT_ID` when a deploy command exports it,
 * and otherwise `chain-signer.json`, which the harness writes to the workspace root before the
 * server starts. With neither, there is no chain stage in play — a plain `validate`, or someone
 * running the command by hand — and the script says so and stops, leaving `validate` as
 * credential-free as it claims to be.
 *
 * Two things make it safe to re-run. The key is rebuilt from the three configured members every
 * time — plus the co-signing agent, if the council has seated it — so seats never accumulate and a
 * previous run's signer is dropped rather than kept. And the
 * update is signed by the two demo members alone: they meet the old key's threshold and, being
 * members of the new one too, its threshold as well — so the incoming signer never has to sign its
 * own way in.
 *
 * It needs the demo members' keys, which live in the gitignored `setup-state.json`, so it runs in a
 * workspace that has already run `yarn setup` rather than in a freshly scaffolded one.
 */
import { readSetupEnv } from "./setup/env";
import { GOVERNANCE_THRESHOLD, demoCouncilMembers } from "./setup/governance";
import { createClient } from "./setup/hedera";
import { accountIdentity } from "./setup/hederaGovernance";
import { AGENT_ACCOUNT, type DemoAccount, loadState } from "./setup/state";
import { AccountId, AccountUpdateTransaction, KeyList, PrivateKey, PublicKey } from "@hiero-ledger/sdk";
import { councilHoldsKey, fetchCouncilKey, governanceAccountMemo } from "@sh/core/governance/council";
import { isMirrorNotFound } from "@sh/core/mirror";
import { config as loadDotenv } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PACKAGE_DIR = resolve(__dirname, "..");
const PATHS = {
  operatorEnv: resolve(PACKAGE_DIR, ".env"),
  stateFile: resolve(PACKAGE_DIR, "setup-state.json"),
  chainSigner: resolve(PACKAGE_DIR, "../..", "chain-signer.json"),
};

/**
 * The ephemeral account this run will sign from, or null when the chain stage is not in play.
 * `chain-signer.json` is the harness's own record of it and is written before the server boots.
 */
function resolveSignerAccountId(source: NodeJS.ProcessEnv): string | null {
  const exported = source.HARNESS_SIGNER_ACCOUNT_ID?.trim();
  if (exported) return exported;
  if (!existsSync(PATHS.chainSigner)) return null;
  const { accountId } = JSON.parse(readFileSync(PATHS.chainSigner, "utf8")) as { accountId?: string };
  return accountId?.trim() || null;
}

/** Mirror indexes a freshly created account a few seconds late; every other error is raised at once. */
async function awaitIndexing<T>(read: () => Promise<T>): Promise<T> {
  const delaysMs = [1000, 2000, 3000, 4000, 5000, 5000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      if (attempt >= delaysMs.length || !isMirrorNotFound(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, delaysMs[attempt]));
    }
  }
}

/**
 * The co-signing agent's key, when the council has already seated it. The agent's account is created
 * outside the council and seated by a rotation the council approves, so a rebuild that dropped it
 * would undo that proposal on every harness run.
 */
async function seatedAgentKeys(
  agent: DemoAccount | undefined,
  governanceAccountId: string,
  network: ReturnType<typeof readSetupEnv>["network"],
): Promise<string[]> {
  if (!agent) return [];
  const council = await fetchCouncilKey(governanceAccountId, network);
  return councilHoldsKey(council, PublicKey.fromString(agent.publicKey).toStringRaw()) ? [agent.publicKey] : [];
}

async function main(): Promise<void> {
  const signerAccountId = resolveSignerAccountId(process.env);
  if (!signerAccountId) {
    console.log("No harness chain signer for this run, so there is no seat to give. Continuing.");
    return;
  }

  loadDotenv({ path: PATHS.operatorEnv, quiet: true });
  const env = readSetupEnv(process.env);

  const state = loadState(PATHS.stateFile, env.network);
  if (!state.governance) {
    throw new Error(`No governance account in ${PATHS.stateFile}. Run \`yarn setup\` before validating on chain.`);
  }
  const [alice, bob] = demoCouncilMembers(state);

  const [council, signer] = await Promise.all([
    accountIdentity(env.councilAccountId, env.network),
    // The signer was created moments ago with an EVM alias, so the Mirror Node answers 404 for its
    // 0.0.x id for a few seconds. Same wait as `resolveBurnerAccountId` in the app.
    awaitIndexing(() => accountIdentity(signerAccountId, env.network)),
  ]);

  const agentKeys = await seatedAgentKeys(state.demoAccounts[AGENT_ACCOUNT], state.governance.accountId, env.network);
  const memberKeys = [council.publicKey, alice.publicKey, bob.publicKey, ...agentKeys, signer.publicKey];
  const seated = new KeyList(
    memberKeys.map(key => PublicKey.fromString(key)),
    GOVERNANCE_THRESHOLD,
  );

  const client = createClient(env);
  try {
    const update = await new AccountUpdateTransaction()
      .setAccountId(AccountId.fromString(state.governance.accountId))
      .setKey(seated)
      .setAccountMemo(governanceAccountMemo(GOVERNANCE_THRESHOLD, memberKeys.length))
      .freezeWith(client);
    for (const member of [alice, bob]) await update.sign(PrivateKey.fromStringDer(member.privateKey));

    const receipt = await (await update.execute(client)).getReceipt(client);
    console.log(
      `Council of ${state.governance.accountId} is now ${GOVERNANCE_THRESHOLD}-of-${memberKeys.length} ` +
        `with the test signer ${signerAccountId} seated: ${receipt.status.toString()}`,
    );
  } finally {
    client.close();
  }
}

/**
 * This runs in front of the dev server, so a non-zero exit takes the whole evaluation down with it
 * — one slow Mirror read would cost every assertion, not just the one that needs an approval. It
 * says loudly what went wrong and lets the server start; the assertion that needs the seat then
 * fails on its own, with this line above it in the log.
 */
main().catch((error: unknown) => {
  console.error(
    `Could not seat the test signer on the council: ${error instanceof Error ? error.message : String(error)}`,
  );
  console.error("Starting anyway. Assertions that need an approval will fail.");
});
