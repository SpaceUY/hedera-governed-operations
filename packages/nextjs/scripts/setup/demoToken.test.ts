import {
  DEMO_TOKEN_HOLDER,
  DEMO_TOKEN_HOLDER_BALANCE,
  type DemoTokenActions,
  type DemoTokenLookups,
  reconcileDemoToken,
} from "./demoToken";
import { type DemoAccount, type SetupState, emptyState } from "./state";
import { describe, expect, it, vi } from "vitest";

const TOKEN_ADMIN = "0.0.admin";

const account = (suffix: string): DemoAccount => ({
  accountId: `0.0.${suffix}`,
  privateKey: `key-${suffix}`,
  publicKey: `pub-${suffix}`,
  evmAddress: `0x${suffix}`,
});

const lookupsWhere = (overrides: Partial<DemoTokenLookups>): DemoTokenLookups => ({
  tokenPauseKeyContractId: vi.fn(async () => TOKEN_ADMIN),
  accountHasToken: vi.fn(async () => true),
  accountTokenBalance: vi.fn(async () => DEMO_TOKEN_HOLDER_BALANCE),
  ...overrides,
});

const recordingActions = (): DemoTokenActions => ({
  createDemoToken: vi.fn(async () => "0.0.token"),
  associateToken: vi.fn(async () => undefined),
  fundHolder: vi.fn(async () => undefined),
});

const withDemoAccounts = (): SetupState => ({
  ...emptyState("testnet"),
  demoAccounts: { alice: account("alice"), bob: account("bob") },
});

const withToken = (): SetupState => ({ ...withDemoAccounts(), demoTokenId: "0.0.token" });

const run = (state: SetupState, overrides: Partial<DemoTokenLookups> = {}, actions = recordingActions()) =>
  reconcileDemoToken(state, TOKEN_ADMIN, { lookups: lookupsWhere(overrides), actions });

const callCounts = (actions: DemoTokenActions) =>
  [actions.createDemoToken, actions.associateToken, actions.fundHolder].map(fn => vi.mocked(fn).mock.calls.length);

describe("reconcileDemoToken", () => {
  it("creates the token with its keys on the deployed TokenAdmin", async () => {
    const actions = recordingActions();
    await run(withDemoAccounts(), {}, actions);
    expect(actions.createDemoToken).toHaveBeenCalledWith(TOKEN_ADMIN);
  });

  it("returns the created token id", async () => {
    const { tokenId } = await run(withDemoAccounts());
    expect(tokenId).toBe("0.0.token");
  });

  it("associates the holder to a token it just created without looking the relation up", async () => {
    const lookups = lookupsWhere({});
    await reconcileDemoToken(withDemoAccounts(), TOKEN_ADMIN, { lookups, actions: recordingActions() });
    expect(lookups.accountHasToken).not.toHaveBeenCalled();
  });

  it("gives the holder a balance, because a freeze over nothing is invisible", async () => {
    const actions = recordingActions();
    await run(withDemoAccounts(), {}, actions);
    expect(actions.fundHolder).toHaveBeenCalledWith(account(DEMO_TOKEN_HOLDER), "0.0.token", DEMO_TOKEN_HOLDER_BALANCE);
  });

  it("runs no action when the token and its holder are already settled", async () => {
    const actions = recordingActions();
    await run(withToken(), {}, actions);
    expect(callCounts(actions)).toEqual([0, 0, 0]);
  });

  it("recreates a token the network no longer knows", async () => {
    const actions = recordingActions();
    await run(withToken(), { tokenPauseKeyContractId: vi.fn(async () => undefined) }, actions);
    expect(actions.createDemoToken).toHaveBeenCalledTimes(1);
  });

  it("refuses a token whose pause key points at a different TokenAdmin", async () => {
    await expect(run(withToken(), { tokenPauseKeyContractId: vi.fn(async () => "0.0.old") })).rejects.toThrow(
      /0\.0\.old/,
    );
  });

  it("explains that such a token can never be repaired", async () => {
    await expect(run(withToken(), { tokenPauseKeyContractId: vi.fn(async () => "0.0.old") })).rejects.toThrow(
      /admin key/,
    );
  });

  it("says how to replace an orphaned token", async () => {
    await expect(run(withToken(), { tokenPauseKeyContractId: vi.fn(async () => "0.0.old") })).rejects.toThrow(
      /setup-state\.json/,
    );
  });

  it("creates nothing when the token is orphaned", async () => {
    const actions = recordingActions();
    await run(withToken(), { tokenPauseKeyContractId: vi.fn(async () => "0.0.old") }, actions).catch(() => undefined);
    expect(callCounts(actions)).toEqual([0, 0, 0]);
  });

  it("re-associates and refunds a holder whose association was dropped, keeping the token", async () => {
    const actions = recordingActions();
    await run(withToken(), { accountHasToken: vi.fn(async () => false) }, actions);
    expect(callCounts(actions)).toEqual([0, 1, 1]);
  });

  it("tops up a holder left with no balance", async () => {
    const actions = recordingActions();
    await run(withToken(), { accountTokenBalance: vi.fn(async () => 0) }, actions);
    expect(callCounts(actions)).toEqual([0, 0, 1]);
  });

  it("leaves a holder that spent part of its balance alone", async () => {
    const actions = recordingActions();
    await run(withToken(), { accountTokenBalance: vi.fn(async () => 1) }, actions);
    expect(actions.fundHolder).not.toHaveBeenCalled();
  });

  it("reports the token and its holder", async () => {
    const { steps } = await run(withToken());
    expect(steps).toEqual([
      { label: "Demo token 0.0.token", outcome: "reused" },
      { label: `Demo token association for ${DEMO_TOKEN_HOLDER}`, outcome: "reused" },
      { label: `Demo token balance for ${DEMO_TOKEN_HOLDER}`, outcome: "reused" },
    ]);
  });

  it("persists a created token before its holder is settled, so a failure never orphans it", async () => {
    const persist = vi.fn();
    const actions = recordingActions();
    actions.associateToken = vi.fn(async () => {
      throw new Error("association failed");
    });
    await expect(
      reconcileDemoToken(withDemoAccounts(), TOKEN_ADMIN, { lookups: lookupsWhere({}), actions, persist }),
    ).rejects.toThrow("association failed");
    expect(persist).toHaveBeenCalledWith("0.0.token");
  });

  it("does not persist a token it only reused", async () => {
    const persist = vi.fn();
    await reconcileDemoToken(withToken(), TOKEN_ADMIN, {
      lookups: lookupsWhere({}),
      actions: recordingActions(),
      persist,
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it("fails when the holder is missing from the state", async () => {
    await expect(run(emptyState("testnet"))).rejects.toThrow(new RegExp(DEMO_TOKEN_HOLDER));
  });
});
