/**
 * `yarn setup` — idempotent testnet bootstrap.
 * Reads the operator from packages/nextjs/.env, creates (or reuses) the funded demo
 * accounts and their USDC association, persists ids in setup-state.json and writes the app env
 * to .env.local. Safe to re-run: existing ids are verified on the Mirror Node before anything is created.
 */
import { appEnvEntries } from "./setup/appEnv";
import { readSetupEnv } from "./setup/env";
import { upsertEnvFile } from "./setup/envFile";
import { setupGovernance, setupMerchant } from "./setup/extensions";
import { createActions, createClient, createLookups } from "./setup/hedera";
import { reconcile } from "./setup/reconcile";
import { formatSteps, formatSummary } from "./setup/report";
import { type SetupState, loadState, saveState } from "./setup/state";
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

const PACKAGE_DIR = resolve(__dirname, "..");
const PATHS = {
  operatorEnv: resolve(PACKAGE_DIR, ".env"),
  stateFile: resolve(PACKAGE_DIR, "setup-state.json"),
  envFile: resolve(PACKAGE_DIR, ".env.local"),
};

async function main(): Promise<void> {
  loadDotenv({ path: PATHS.operatorEnv, quiet: true });
  const env = readSetupEnv(process.env);
  const client = createClient(env);
  const lookups = createLookups(env);
  const persist = (next: SetupState) => saveState(PATHS.stateFile, next);

  try {
    console.log(`Setting up ${env.network} with operator ${env.operatorId}...`);
    const { state, steps } = await reconcile(loadState(PATHS.stateFile, env.network), {
      lookups,
      actions: createActions(client),
      persist,
    });
    console.log(formatSteps(steps).join("\n"));

    const ctx = { env, client, lookups, state, saveState: persist };
    await setupGovernance(ctx);
    await setupMerchant(ctx);

    const finalState = loadState(PATHS.stateFile, env.network);
    upsertEnvFile(PATHS.envFile, appEnvEntries(finalState));
    console.log(formatSummary(finalState, env, PATHS).join("\n"));
  } finally {
    client.close();
  }
}

main().catch((error: unknown) => {
  console.error(`Setup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
