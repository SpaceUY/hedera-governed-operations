import type { SetupEnv } from "./env";
import { hashScanUrl } from "./hashscan";
import { type SetupStep, USDC_TESTNET_TOKEN_ID } from "./reconcile";
import { DEMO_ACCOUNT_NAMES, type SetupState } from "./state";

const OUTCOME_MARK = { created: "+", reused: "=" } as const;

export function formatSteps(steps: SetupStep[]): string[] {
  return steps.map(step => `  ${OUTCOME_MARK[step.outcome]} ${step.label} (${step.outcome})`);
}

function accountLines(state: SetupState, network: SetupEnv["network"]): string[] {
  return DEMO_ACCOUNT_NAMES.flatMap(name => {
    const account = state.demoAccounts[name];
    if (!account) return [];
    return [`  ${name}: ${account.accountId}  ${hashScanUrl("account", account.accountId, network)}`];
  });
}

/** Summary printed at the end of a run. Ids and links only: private keys stay in the state file. */
export function formatSummary(
  state: SetupState,
  env: SetupEnv,
  paths: { stateFile: string; envFile: string },
): string[] {
  const topic = state.topicId ?? "(missing)";
  return [
    "",
    `Network:  ${env.network}`,
    `Operator: ${env.operatorId}  ${hashScanUrl("account", env.operatorId, env.network)}`,
    `Topic:    ${topic}  ${hashScanUrl("topic", topic, env.network)}`,
    `USDC:     ${USDC_TESTNET_TOKEN_ID}  ${hashScanUrl("token", USDC_TESTNET_TOKEN_ID, env.network)}`,
    "Demo accounts (USDC associated):",
    ...accountLines(state, env.network),
    "",
    `App env written to ${paths.envFile}`,
    `Demo account keys are in ${paths.stateFile} (gitignored); they are never printed.`,
  ];
}
