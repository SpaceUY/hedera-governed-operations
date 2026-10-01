import { GOVERNANCE_THRESHOLD } from "./governance";
import { type DemoAccount, type SetupState, emptyState } from "./state";
import {
  type TreasuryAssociationActions,
  type TreasuryAssociationLookups,
  associateFreshTreasury,
  reconcileTreasuryAssociation,
} from "./treasuryAssociation";
import { MirrorNodeError } from "@sh/core/mirror";
import { describe, expect, it, vi } from "vitest";

const USDC = "0.0.5449";
const GOVERNANCE_ACCOUNT = "0.0.governance";

const account = (suffix: string): DemoAccount => ({
  accountId: `0.0.${suffix}`,
  privateKey: `key-${suffix}`,
  publicKey: `pub-${suffix}`,
  evmAddress: `0x${suffix}`,
});

const lookupsWhere = (associated: boolean): TreasuryAssociationLookups => ({
  accountHasToken: vi.fn(async () => associated),
});

const recordingActions = (): TreasuryAssociationActions => ({
  associateGovernanceToken: vi.fn(async () => undefined),
});

const governedState = (): SetupState => ({
  ...emptyState("testnet"),
  demoAccounts: { alice: account("alice"), bob: account("bob") },
  governance: { accountId: GOVERNANCE_ACCOUNT, evmAddress: "0xgov", councilAccountId: "0.0.council" },
});

const run = (state: SetupState, associated: boolean, actions = recordingActions()) =>
  reconcileTreasuryAssociation(state, USDC, { lookups: lookupsWhere(associated), actions });

describe("reconcileTreasuryAssociation", () => {
  it("associates the swap's output token on the governance account", async () => {
    const actions = recordingActions();
    await run(governedState(), false, actions);
    expect(actions.associateGovernanceToken).toHaveBeenCalledWith(GOVERNANCE_ACCOUNT, USDC, expect.anything());
  });

  it("signs with as many council members as the threshold needs", async () => {
    const actions = recordingActions();
    await run(governedState(), false, actions);
    const [, , signers] = vi.mocked(actions.associateGovernanceToken).mock.calls[0];
    expect(signers).toHaveLength(GOVERNANCE_THRESHOLD);
  });

  it("reports a token it created the relation for", async () => {
    const { outcome } = await run(governedState(), false);
    expect(outcome).toBe("created");
  });

  it("leaves an already associated treasury untouched", async () => {
    const actions = recordingActions();
    await run(governedState(), true, actions);
    expect(actions.associateGovernanceToken).not.toHaveBeenCalled();
  });

  it("reports a relation it found rather than made", async () => {
    const { outcome } = await run(governedState(), true);
    expect(outcome).toBe("reused");
  });

  it("names the token in its step, since a treasury can hold several", async () => {
    const { label } = await run(governedState(), true);
    expect(label).toContain(USDC);
  });

  it("refuses to guess at an account when the governance account is not created yet", async () => {
    const withoutGovernance = { ...governedState(), governance: undefined };
    await expect(run(withoutGovernance, false)).rejects.toThrow(/governance account/i);
  });

  it("refuses when a council seat's key is missing, rather than signing below the threshold", async () => {
    const oneSeat = { ...governedState(), demoAccounts: { alice: account("alice") } };
    await expect(run(oneSeat, false)).rejects.toThrow();
  });

  it("fails on a 404 for a governance account the state already held, rather than waiting it out", async () => {
    const notFound = new MirrorNodeError(404, "https://mirror/api/v1/accounts/0.0.governance/tokens", "Not found");
    const lookups: TreasuryAssociationLookups = { accountHasToken: vi.fn(async () => Promise.reject(notFound)) };
    await expect(
      reconcileTreasuryAssociation(governedState(), USDC, { lookups, actions: recordingActions() }),
    ).rejects.toBe(notFound);
  });
});

describe("associateFreshTreasury", () => {
  it("associates a governance account created in this run without asking the Mirror Node", async () => {
    const actions = recordingActions();
    const { outcome } = await associateFreshTreasury(governedState(), USDC, actions);
    expect(outcome).toBe("created");
    expect(actions.associateGovernanceToken).toHaveBeenCalledWith(GOVERNANCE_ACCOUNT, USDC, expect.anything());
  });
});
