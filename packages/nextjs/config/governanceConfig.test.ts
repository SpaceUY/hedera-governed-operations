import { GOVERNANCE_ROUTES, getDeployedContract, getGovernanceEntityIds } from "./governanceConfig";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("~~/utils/scaffold-hbar/contract", () => ({
  contracts: {
    296: {
      GovernedExecutor: { address: "0xabc", abi: [], hederaContractId: "0.0.10671250" },
      TokenAdmin: { address: "0xdef", abi: [] },
    },
  },
}));

describe("getGovernanceEntityIds", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads the ids yarn setup writes", () => {
    vi.stubEnv("NEXT_PUBLIC_GOVERNANCE_ACCOUNT_ID", "0.0.10671146");
    vi.stubEnv("NEXT_PUBLIC_DEMO_TOKEN_ID", "0.0.10671333");
    vi.stubEnv("NEXT_PUBLIC_SEED_PROPOSAL_ID", "3");

    expect(getGovernanceEntityIds()).toEqual({
      governanceAccountId: "0.0.10671146",
      demoTokenId: "0.0.10671333",
      seedProposalId: 3,
    });
  });

  it("throws a clear error when yarn setup has not run", () => {
    vi.stubEnv("NEXT_PUBLIC_GOVERNANCE_ACCOUNT_ID", "");
    expect(() => getGovernanceEntityIds()).toThrow(/yarn setup/);
  });

  it("rejects a seed proposal id that is not an integer instead of returning NaN", () => {
    vi.stubEnv("NEXT_PUBLIC_GOVERNANCE_ACCOUNT_ID", "0.0.10671146");
    vi.stubEnv("NEXT_PUBLIC_DEMO_TOKEN_ID", "0.0.10671333");
    vi.stubEnv("NEXT_PUBLIC_SEED_PROPOSAL_ID", "three");
    expect(() => getGovernanceEntityIds()).toThrow(/must be an integer/);
  });
});

describe("getDeployedContract", () => {
  it("returns the deployed entry", () => {
    expect(getDeployedContract(296, "GovernedExecutor").hederaContractId).toBe("0.0.10671250");
  });

  it("throws a clear, actionable error when the chain has no deployment", () => {
    expect(() => getDeployedContract(296, "AcmeVault")).toThrow(/AcmeVault is not deployed on chain 296/);
  });

  it("treats an entry without a Hedera contract id as not deployed rather than returning undefined", () => {
    expect(() => getDeployedContract(296, "TokenAdmin")).toThrow(/TokenAdmin on chain 296 has no Hedera contract id/);
  });
});

describe("GOVERNANCE_ROUTES", () => {
  it("builds a proposal path from its schedule id", () => {
    expect(GOVERNANCE_ROUTES.proposal("0.0.777")).toBe("/governance/0.0.777");
  });
});
