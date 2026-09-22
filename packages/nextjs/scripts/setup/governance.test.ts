import type { SetupEnv } from "./env";
import {
  type AccountIdentity,
  type GovernanceActions,
  type GovernanceLookups,
  reconcileGovernance,
} from "./governance";
import { type DemoAccount, type SetupState, emptyState } from "./state";
import { describe, expect, it, vi } from "vitest";

const account = (suffix: string): DemoAccount => ({
  accountId: `0.0.${suffix}`,
  privateKey: `key-${suffix}`,
  publicKey: `pub-${suffix}`,
  evmAddress: `0x${suffix}`,
});

const env: SetupEnv = {
  operatorId: "0.0.operator",
  operatorPrivateKey: "operator-key",
  councilAccountId: "0.0.council",
  network: "testnet",
};

const identities: Record<string, AccountIdentity> = {
  "0.0.council": { publicKey: "pub-council", evmAddress: "0xcouncil" },
  "0.0.operator": { publicKey: "pub-operator", evmAddress: "0xoperator" },
};

const lookupsWhere = (overrides: Partial<GovernanceLookups>): GovernanceLookups => ({
  accountExists: vi.fn(async () => true),
  accountIdentity: vi.fn(async (accountId: string) => identities[accountId]),
  ...overrides,
});

const recordingActions = (): GovernanceActions => ({
  createGovernanceAccount: vi.fn(async () => ({ accountId: "0.0.gov", evmAddress: "0xgov" })),
});

const withDemoAccounts = (): SetupState => ({
  ...emptyState("testnet"),
  demoAccounts: { alice: account("alice"), bob: account("bob") },
});

const withGovernance = (): SetupState => ({
  ...withDemoAccounts(),
  governance: { accountId: "0.0.gov", evmAddress: "0xgov", councilAccountId: "0.0.council" },
});

const run = (state: SetupState, overrides: Partial<GovernanceLookups> = {}, actions = recordingActions()) =>
  reconcileGovernance(state, env, { lookups: lookupsWhere(overrides), actions });

describe("reconcileGovernance", () => {
  it("creates the account from the council member and both demo accounts", async () => {
    const actions = recordingActions();
    await run(withDemoAccounts(), {}, actions);
    expect(actions.createGovernanceAccount).toHaveBeenCalledWith(["pub-council", "pub-alice", "pub-bob"]);
  });

  it("records the council member the account was created against", async () => {
    const { governance } = await run(withDemoAccounts());
    expect(governance).toEqual({ accountId: "0.0.gov", evmAddress: "0xgov", councilAccountId: "0.0.council" });
  });

  it("reports the account as created", async () => {
    const { step } = await run(withDemoAccounts());
    expect(step).toEqual({ label: "Governance account 0.0.gov (2-of-3)", outcome: "created" });
  });

  it("reuses an account the mirror still knows", async () => {
    const actions = recordingActions();
    const { step } = await run(withGovernance(), {}, actions);
    expect([step.outcome, vi.mocked(actions.createGovernanceAccount).mock.calls.length]).toEqual(["reused", 0]);
  });

  it("recreates the account when the mirror does not know it", async () => {
    const actions = recordingActions();
    await run(withGovernance(), { accountExists: vi.fn(async (id: string) => id !== "0.0.gov") }, actions);
    expect(actions.createGovernanceAccount).toHaveBeenCalledTimes(1);
  });

  it("proposes the council member, the operator and both demo accounts", async () => {
    const { proposers } = await run(withDemoAccounts());
    expect(proposers).toEqual(["0xcouncil", "0xoperator", "0xalice", "0xbob"]);
  });

  it("lists an account that is both council member and operator once", async () => {
    const sameAccount = { ...env, councilAccountId: "0.0.operator" };
    const { proposers } = await reconcileGovernance(withDemoAccounts(), sameAccount, {
      lookups: lookupsWhere({}),
      actions: recordingActions(),
    });
    expect(proposers).toEqual(["0xoperator", "0xalice", "0xbob"]);
  });

  it("refuses to run when the council account does not exist on the network", async () => {
    await expect(
      run(withDemoAccounts(), { accountExists: vi.fn(async (id: string) => id !== "0.0.council") }),
    ).rejects.toThrow("HEDERA_COUNCIL_ACCOUNT_ID");
  });

  it("creates nothing when the council account does not exist", async () => {
    const actions = recordingActions();
    await run(withDemoAccounts(), { accountExists: vi.fn(async (id: string) => id !== "0.0.council") }, actions).catch(
      () => undefined,
    );
    expect(actions.createGovernanceAccount).not.toHaveBeenCalled();
  });

  it("refuses to reuse an account created against a different council member", async () => {
    const moved = { ...env, councilAccountId: "0.0.someone-else" };
    await expect(
      reconcileGovernance(withGovernance(), moved, { lookups: lookupsWhere({}), actions: recordingActions() }),
    ).rejects.toThrow(/0\.0\.gov/);
  });

  it("says what to do when the council member changed", async () => {
    const moved = { ...env, councilAccountId: "0.0.someone-else" };
    await expect(
      reconcileGovernance(withGovernance(), moved, { lookups: lookupsWhere({}), actions: recordingActions() }),
    ).rejects.toThrow(/setup-state\.json/);
  });

  it("fails when the demo accounts the threshold key needs are missing", async () => {
    await expect(run(emptyState("testnet"))).rejects.toThrow(/demo account/i);
  });
});
