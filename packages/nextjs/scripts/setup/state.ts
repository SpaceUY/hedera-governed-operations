import type { SetupNetwork } from "./env";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const DEMO_ACCOUNT_NAMES = ["alice", "bob", "agent"] as const;

export type DemoAccountName = (typeof DEMO_ACCOUNT_NAMES)[number];

/** The demo accounts that hold a seat on the council from the start, in the order the key lists them. */
export const DEMO_COUNCIL_MEMBERS = ["alice", "bob"] as const satisfies readonly DemoAccountName[];

/**
 * The co-signing agent's own account. It is created outside the council on purpose: the council
 * seats it by rotation ("Add the co-signing agent"), and until then the agent decides and logs but
 * signs nothing. Two places depend on it — the agent's `.env` and the submit key of the topic it
 * publishes its decisions to — so it is named once here. In a real deployment it is whatever identity
 * runs the service.
 */
export const AGENT_ACCOUNT: DemoAccountName = "agent";

/** Keys are stored DER-encoded; they only ever live in the gitignored state file. */
export type DemoAccount = {
  accountId: string;
  privateKey: string;
  publicKey: string;
  evmAddress: string;
};

/**
 * The account holding the m-of-n key. `councilAccountId` is recorded with it because a threshold
 * key cannot be changed without the council it protects: it is the only way to tell that the
 * account no longer matches the configuration it was created from.
 */
export type GovernanceAccount = {
  accountId: string;
  evmAddress: string;
  councilAccountId: string;
};

/** The proposal left pending for the demo, tied to the registry that holds it. */
export type SeedProposal = {
  id: number;
  executorContractId: string;
};

export type SetupState = {
  version: typeof STATE_VERSION;
  network: SetupNetwork;
  /** Topic the release manifests go to; the agent checks an upgrade proposal against it. */
  releaseTopicId?: string;
  /** Topic the agent publishes its decisions to; its submit key is the agent's, not the operator's. */
  decisionTopicId?: string;
  demoAccounts: Partial<Record<DemoAccountName, DemoAccount>>;
  governance?: GovernanceAccount;
  demoTokenId?: string;
  seedProposal?: SeedProposal;
};

const STATE_VERSION = 1;

export function emptyState(network: SetupNetwork): SetupState {
  return { version: STATE_VERSION, network, demoAccounts: {} };
}

function assertMatches(state: SetupState, network: SetupNetwork, filePath: string): void {
  if (state.version !== STATE_VERSION) {
    throw new Error(`${filePath} has version ${state.version}, expected ${STATE_VERSION}; delete it to start over`);
  }
  if (state.network !== network) {
    throw new Error(`${filePath} was written for ${state.network}, not ${network}; delete it to start over`);
  }
}

export function loadState(filePath: string, network: SetupNetwork): SetupState {
  if (!existsSync(filePath)) return emptyState(network);
  const state = JSON.parse(readFileSync(filePath, "utf8")) as SetupState;
  assertMatches(state, network, filePath);
  return state;
}

export function saveState(filePath: string, state: SetupState): void {
  writeFileSync(filePath, JSON.stringify(state, null, 2) + "\n");
}
