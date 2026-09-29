import type { EnvEntries } from "./envFile";
import { DEMO_ACCOUNT_NAMES, type SetupState } from "./state";

/**
 * Variables derived from the setup state, written to the one env file this script owns. Most are the
 * app's (see `config/governanceConfig.ts` and `.env.example`); the agent's decision topic is here too
 * because this is where an operator looks for an id `yarn setup` created, and it is copied from here
 * into `packages/agent/.env`.
 */
export function appEnvEntries(state: SetupState): EnvEntries {
  const entries: EnvEntries = {};
  if (state.releaseTopicId) entries.NEXT_PUBLIC_RELEASE_TOPIC_ID = state.releaseTopicId;
  if (state.decisionTopicId) entries.AGENT_DECISION_TOPIC_ID = state.decisionTopicId;
  for (const name of DEMO_ACCOUNT_NAMES) {
    const account = state.demoAccounts[name];
    if (account) entries[`NEXT_PUBLIC_DEMO_ACCOUNT_${name.toUpperCase()}_ID`] = account.accountId;
  }
  if (state.governance) entries.NEXT_PUBLIC_GOVERNANCE_ACCOUNT_ID = state.governance.accountId;
  if (state.demoTokenId) entries.NEXT_PUBLIC_DEMO_TOKEN_ID = state.demoTokenId;
  // Proposal ids are registry indexes, so the first one is 0 and a truthiness check would drop it.
  if (state.seedProposal) entries.NEXT_PUBLIC_SEED_PROPOSAL_ID = String(state.seedProposal.id);
  return entries;
}
