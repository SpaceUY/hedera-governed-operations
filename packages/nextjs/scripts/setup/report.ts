import type { SetupEnv } from "./env";
import { GOVERNANCE_THRESHOLD } from "./governance";
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

/** Lines for the governed-operations fixtures, skipped entirely until the contracts are deployed. */
function governanceLines(state: SetupState, network: SetupEnv["network"]): string[] {
  const lines: string[] = [];
  if (state.governance) {
    const { accountId, councilAccountId } = state.governance;
    lines.push(
      `Council:  ${accountId}  ${hashScanUrl("account", accountId, network)}`,
      `          ${GOVERNANCE_THRESHOLD}-of-3: ${councilAccountId} (yours), ${DEMO_ACCOUNT_NAMES.join(", ")}`,
    );
  }
  if (state.demoTokenId) {
    lines.push(`Token:    ${state.demoTokenId}  ${hashScanUrl("token", state.demoTokenId, network)}`);
  }
  if (state.seedProposal) {
    lines.push(`Proposal: #${state.seedProposal.id} pending on ${state.seedProposal.executorContractId}`);
  }
  return lines;
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
    ...governanceLines(state, env.network),
    "",
    `App env written to ${paths.envFile}`,
    `Demo account keys are in ${paths.stateFile} (gitignored); they are never printed.`,
  ];
}
