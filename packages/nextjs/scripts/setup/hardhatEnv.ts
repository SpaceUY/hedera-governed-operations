/**
 * The handoff to the other workspace. `deploy/00_deploy_governed_executor.ts` refuses to run on
 * Hedera without the governance address and the proposer list, and neither exists until this
 * script has created the governance account — so setup writes them where that deploy reads them,
 * `packages/hardhat/.env`, instead of asking anyone to copy ids between files.
 *
 * Only these two keys are touched; `upsertEnvFile` leaves every other line, the encrypted deployer
 * key included, exactly as it found it.
 */
import type { EnvEntries } from "./envFile";
import type { GovernanceAccount } from "./state";
import { resolve } from "node:path";

export const HARDHAT_ENV_PATH = resolve(__dirname, "../../../hardhat/.env");

export function hardhatEnvEntries(governance: GovernanceAccount, proposers: string[]): EnvEntries {
  if (proposers.length === 0) {
    throw new Error("Refusing to write an empty INITIAL_PROPOSERS: nobody could register a proposal");
  }
  return {
    GOVERNANCE_ACCOUNT_ADDRESS: governance.evmAddress,
    INITIAL_PROPOSERS: proposers.join(","),
  };
}
