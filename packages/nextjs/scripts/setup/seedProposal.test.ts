import type { GovernanceDeployment } from "./deployments";
import {
  type SeedProposalActions,
  type SeedProposalLookups,
  reconcileSeedProposal,
  seedProposalCalldata,
} from "./seedProposal";
import { type SetupState, emptyState } from "./state";
import { describe, expect, it, vi } from "vitest";

const deployment: GovernanceDeployment = {
  executorEvm: "0xexec",
  executorContractId: "0.0.exec",
  vaultProxyEvm: "0x0000000000000000000000000000000000000abc",
  vaultV2Evm: "0x0000000000000000000000000000000000000def",
  tokenAdminContractId: "0.0.admin",
};

const lookupsWhere = (overrides: Partial<SeedProposalLookups>): SeedProposalLookups => ({
  proposalSettled: vi.fn(async () => false),
  ...overrides,
});

const recordingActions = (): SeedProposalActions => ({
  createProposal: vi.fn(async () => 7),
});

const withSeed = (executorContractId = "0.0.exec"): SetupState => ({
  ...emptyState("testnet"),
  seedProposal: { id: 3, executorContractId },
});

const run = (state: SetupState, overrides: Partial<SeedProposalLookups> = {}, actions = recordingActions()) =>
  reconcileSeedProposal(state, deployment, { lookups: lookupsWhere(overrides), actions });

describe("seedProposalCalldata", () => {
  it("is a call to the UUPS upgrade entry point", () => {
    expect(seedProposalCalldata(deployment.vaultV2Evm).startsWith("0x4f1ef286")).toBe(true);
  });

  it("carries the implementation the proxy should point at", () => {
    expect(seedProposalCalldata(deployment.vaultV2Evm)).toContain("def");
  });

  // The registry stores this verbatim, and that storage is what the gas limit pays for: a bare
  // selector fits in 200k, these 100 bytes do not.
  it("is a hundred bytes long, which is what SEED_PROPOSAL_GAS is sized for", () => {
    expect((seedProposalCalldata(deployment.vaultV2Evm).length - 2) / 2).toBe(100);
  });
});

describe("reconcileSeedProposal", () => {
  it("registers a proposal when the state has none", async () => {
    const actions = recordingActions();
    await run(emptyState("testnet"), {}, actions);
    expect(actions.createProposal).toHaveBeenCalledWith(
      deployment.executorContractId,
      deployment.vaultProxyEvm,
      seedProposalCalldata(deployment.vaultV2Evm),
    );
  });

  it("records the registered id against the executor that holds it", async () => {
    const { seedProposal } = await run(emptyState("testnet"));
    expect(seedProposal).toEqual({ id: 7, executorContractId: "0.0.exec" });
  });

  it("reports what it registered", async () => {
    const { step } = await run(emptyState("testnet"));
    expect(step).toEqual({ label: "Seed proposal #7 (upgrade AcmeVault to AcmeVaultV2)", outcome: "created" });
  });

  it("leaves a proposal that is still pending alone", async () => {
    const actions = recordingActions();
    const { seedProposal } = await run(withSeed(), {}, actions);
    expect([seedProposal.id, vi.mocked(actions.createProposal).mock.calls.length]).toEqual([3, 0]);
  });

  it("registers a new one when the council already spent the seed", async () => {
    const actions = recordingActions();
    await run(withSeed(), { proposalSettled: vi.fn(async () => true) }, actions);
    expect(actions.createProposal).toHaveBeenCalledTimes(1);
  });

  it("registers a new one when the proposal belongs to a registry that is no longer deployed", async () => {
    const actions = recordingActions();
    await run(withSeed("0.0.previous"), {}, actions);
    expect(actions.createProposal).toHaveBeenCalledTimes(1);
  });

  it("does not ask the old registry about a proposal it no longer holds", async () => {
    const lookups = lookupsWhere({});
    await reconcileSeedProposal(withSeed("0.0.previous"), deployment, { lookups, actions: recordingActions() });
    expect(lookups.proposalSettled).not.toHaveBeenCalled();
  });
});
