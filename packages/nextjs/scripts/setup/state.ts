import type { SetupNetwork } from "./env";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const DEMO_ACCOUNT_NAMES = ["alice", "bob"] as const;

export type DemoAccountName = (typeof DEMO_ACCOUNT_NAMES)[number];

/** Keys are stored DER-encoded; they only ever live in the gitignored state file. */
export type DemoAccount = {
  accountId: string;
  privateKey: string;
  publicKey: string;
  evmAddress: string;
};

export type SetupState = {
  version: typeof STATE_VERSION;
  network: SetupNetwork;
  topicId?: string;
  demoAccounts: Partial<Record<DemoAccountName, DemoAccount>>;
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
