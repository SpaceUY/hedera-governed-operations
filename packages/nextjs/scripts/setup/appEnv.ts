import type { EnvEntries } from "./envFile";
import { DEMO_ACCOUNT_NAMES, type SetupState } from "./state";

/** Variables the app reads (see `config/proofWallConfig.ts` and `.env.example`), derived from the setup state. */
export function appEnvEntries(state: SetupState): EnvEntries {
  const entries: EnvEntries = {};
  if (state.topicId) entries.NEXT_PUBLIC_PROOF_WALL_TOPIC_ID = state.topicId;
  for (const name of DEMO_ACCOUNT_NAMES) {
    const account = state.demoAccounts[name];
    if (account) entries[`NEXT_PUBLIC_DEMO_ACCOUNT_${name.toUpperCase()}_ID`] = account.accountId;
  }
  return entries;
}
