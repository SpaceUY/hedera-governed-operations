/**
 * `yarn harness:council-seat` — gives the Hedera Harness test signer a seat on the council.
 *
 * The CHAIN stage provisions a fresh funded ECDSA account for each run and hands its key to the
 * app, which is enough to pay for a transaction but not to approve a proposal: a `ScheduleSign`
 * only counts if the key is part of the governance account's threshold key, and the network answers
 * INVALID_SIGNATURE otherwise. This script closes that gap so the CHAIN assertion can grade the
 * real journey instead of an affordance.
 *
 * `.harness/spec.yaml` declares it under `chainValidation.deploy.commands`, which runs before the
 * dev server starts with `HARNESS_SIGNER_ACCOUNT_ID` in the environment.
 *
 * Two things make it safe to re-run. The key is rebuilt from the three configured members every
 * time, so seats never accumulate and a previous run's signer is dropped rather than kept. And the
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
import { loadState } from "./setup/state";
import { AccountId, AccountUpdateTransaction, KeyList, PrivateKey, PublicKey } from "@hiero-ledger/sdk";
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

const PACKAGE_DIR = resolve(__dirname, "..");
const PATHS = {
  operatorEnv: resolve(PACKAGE_DIR, ".env"),
  stateFile: resolve(PACKAGE_DIR, "setup-state.json"),
};

/** The account id the harness exports for the ephemeral signer it provisioned for this run. */
function readSignerAccountId(source: NodeJS.ProcessEnv): string {
  const value = source.HARNESS_SIGNER_ACCOUNT_ID?.trim();
  if (!value) {
    throw new Error(
      "HARNESS_SIGNER_ACCOUNT_ID is not set. The Hedera Harness exports it to the commands under " +
        "chainValidation.deploy; run this through `npx hedera-harness validate-semantic` rather than on its own.",
    );
  }
  return value;
}

async function main(): Promise<void> {
  loadDotenv({ path: PATHS.operatorEnv, quiet: true });
  const env = readSetupEnv(process.env);
  const signerAccountId = readSignerAccountId(process.env);

  const state = loadState(PATHS.stateFile, env.network);
  if (!state.governance) {
    throw new Error(`No governance account in ${PATHS.stateFile}. Run \`yarn setup\` before validating on chain.`);
  }
  const [alice, bob] = demoCouncilMembers(state);

  const [council, signer] = await Promise.all([
    accountIdentity(env.councilAccountId, env.network),
    accountIdentity(signerAccountId, env.network),
  ]);

  const memberKeys = [council.publicKey, alice.publicKey, bob.publicKey, signer.publicKey];
  const seated = new KeyList(
    memberKeys.map(key => PublicKey.fromString(key)),
    GOVERNANCE_THRESHOLD,
  );

  const client = createClient(env);
  try {
    const update = await new AccountUpdateTransaction()
      .setAccountId(AccountId.fromString(state.governance.accountId))
      .setKey(seated)
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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
