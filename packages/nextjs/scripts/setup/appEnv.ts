import type { EnvEntries } from "./envFile";
import { DEMO_ACCOUNT_NAMES, type SetupState } from "./state";

/** Variables the app reads (see `config/proofWallConfig.ts` and `.env.example`), derived from the setup state. */
export function appEnvEntries(state: SetupState): EnvEntries {
  const entries: EnvEntries = {};
  if (state.topicId) entries.NEXT_PUBLIC_PROOF_WALL_TOPIC_ID = state.topicId;
  if (state.releaseTopicId) entries.NEXT_PUBLIC_RELEASE_TOPIC_ID = state.releaseTopicId;
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
