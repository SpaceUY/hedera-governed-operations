import { type MirrorLookups, type SetupActions, USDC_TESTNET_TOKEN_ID, reconcile } from "./reconcile";
import { type DemoAccount, type SetupState, emptyState } from "./state";
import { describe, expect, it, vi } from "vitest";

const account = (suffix: string): DemoAccount => ({
  accountId: `0.0.${suffix}`,
  privateKey: `key-${suffix}`,
  publicKey: `pub-${suffix}`,
  evmAddress: `0x${suffix}`,
});

const lookupsWhere = (overrides: Partial<MirrorLookups>): MirrorLookups => ({
  accountExists: vi.fn(async () => true),
  accountHasToken: vi.fn(async () => true),
  ...overrides,
});

const recordingActions = (): SetupActions => ({
  createDemoAccount: vi.fn(async (name: string) => account(name)),
  associateToken: vi.fn(async () => undefined),
});

const completeState = () => ({
  ...emptyState("testnet"),
  demoAccounts: { alice: account("alice"), bob: account("bob"), agent: account("agent") },
});

const callCounts = (actions: SetupActions) =>
  [actions.createDemoAccount, actions.associateToken].map(fn => vi.mocked(fn).mock.calls.length);

describe("reconcile", () => {
  it("creates one demo account per name from an empty state, the agent's included", async () => {
    const actions = recordingActions();
    await reconcile(emptyState("testnet"), { lookups: lookupsWhere({}), actions });
    expect(vi.mocked(actions.createDemoAccount).mock.calls).toEqual([["alice"], ["bob"], ["agent"]]);
  });

  it("associates USDC to every account it creates", async () => {
    const actions = recordingActions();
    await reconcile(emptyState("testnet"), { lookups: lookupsWhere({}), actions });
    expect(actions.associateToken).toHaveBeenCalledWith(account("alice"), USDC_TESTNET_TOKEN_ID);
  });

  it("skips the mirror token lookup for an account it just created", async () => {
    const lookups = lookupsWhere({});
    await reconcile(emptyState("testnet"), { lookups, actions: recordingActions() });
    expect(lookups.accountHasToken).not.toHaveBeenCalled();
  });

  it("returns the state with the created ids", async () => {
    const { state } = await reconcile(emptyState("testnet"), {
      lookups: lookupsWhere({}),
      actions: recordingActions(),
    });
    expect(state).toEqual(completeState());
  });

  it("runs no action when the state is complete and verified on the mirror", async () => {
    const actions = recordingActions();
    await reconcile(completeState(), { lookups: lookupsWhere({}), actions });
    expect(callCounts(actions)).toEqual([0, 0]);
  });

  it("keeps a state file written when setup still created a topic, without looking the topic up", async () => {
    const olderState = { ...completeState(), topicId: "0.0.1" } as SetupState;
    const { state, steps } = await reconcile(olderState, { lookups: lookupsWhere({}), actions: recordingActions() });
    expect(state).toEqual(olderState);
    expect(steps.map(step => step.label)).not.toContain("Topic 0.0.1");
  });

  it("recreates only the demo account the mirror does not know", async () => {
    const actions = recordingActions();
    const lookups = lookupsWhere({ accountExists: vi.fn(async (id: string) => id !== "0.0.bob") });
    await reconcile(completeState(), { lookups, actions });
    expect(vi.mocked(actions.createDemoAccount).mock.calls).toEqual([["bob"]]);
  });

  it("associates USDC to an existing account that lacks it without recreating it", async () => {
    const actions = recordingActions();
    const lookups = lookupsWhere({ accountHasToken: vi.fn(async (id: string) => id !== "0.0.alice") });
    await reconcile(completeState(), { lookups, actions });
    expect(callCounts(actions)).toEqual([0, 1]);
  });

  it("persists a created account before its association so a failure never orphans it", async () => {
    const persist = vi.fn();
    const actions = recordingActions();
    actions.associateToken = vi.fn(async () => {
      throw new Error("association failed");
    });
    await expect(reconcile(emptyState("testnet"), { lookups: lookupsWhere({}), actions, persist })).rejects.toThrow(
      "association failed",
    );
    expect(persist).toHaveBeenLastCalledWith({
      ...emptyState("testnet"),
      demoAccounts: { alice: account("alice") },
    });
  });

  it("reports what was created and what was reused", async () => {
    const lookups = lookupsWhere({ accountExists: vi.fn(async (id: string) => id !== "0.0.bob") });
    const { steps } = await reconcile(completeState(), { lookups, actions: recordingActions() });
    expect(steps).toEqual([
      { label: "Demo account alice 0.0.alice", outcome: "reused" },
      { label: "USDC association for alice", outcome: "reused" },
      { label: "Demo account bob 0.0.bob", outcome: "created" },
      { label: "USDC association for bob", outcome: "created" },
      { label: "Demo account agent 0.0.agent", outcome: "reused" },
      { label: "USDC association for agent", outcome: "reused" },
    ]);
  });
});
