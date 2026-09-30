import {
  GOVERNANCE_ROUTES,
  findDeployedContract,
  findDeployment,
  getDeployedContract,
  getGovernanceEntityIds,
  getReleaseTopicId,
  resolveGovernanceConfig,
} from "./governanceConfig";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("~~/utils/scaffold-hbar/contract", () => ({
  contracts: {
    296: {
      GovernedExecutor: { address: "0xabc", abi: [], hederaContractId: "0.0.10671250" },
      TokenAdmin: { address: "0xdef", abi: [] },
    },
    295: {
      GovernedExecutor: { address: "0x01", abi: [], hederaContractId: "0.0.1" },
      AcmeVault: { address: "0x02", abi: [], hederaContractId: "0.0.2" },
      // No AcmeVaultV2: only the wizard's upgrade form needs the vault's next implementation.
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

describe("getReleaseTopicId", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads the release topic yarn setup writes", () => {
    vi.stubEnv("NEXT_PUBLIC_RELEASE_TOPIC_ID", " 0.0.10671400 ");
    expect(getReleaseTopicId()).toBe("0.0.10671400");
  });

  it("is null when no release topic is configured, which hides the release line", () => {
    vi.stubEnv("NEXT_PUBLIC_RELEASE_TOPIC_ID", "");
    expect(getReleaseTopicId()).toBeNull();
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

describe("findDeployment", () => {
  it("returns an entry the deploy recorded no Hedera contract id for, so it can still be named by address", () => {
    expect(findDeployment(296, "TokenAdmin")?.address).toBe("0xdef");
  });

  it("returns null for a contract the chain has no deployment of", () => {
    expect(findDeployment(296, "AcmeVault")).toBeNull();
    expect(findDeployment(1, "GovernedExecutor")).toBeNull();
  });
});

describe("findDeployedContract", () => {
  it("returns the deployed entry", () => {
    expect(findDeployedContract(295, "AcmeVault")?.hederaContractId).toBe("0.0.2");
  });

  it("returns null where getDeployedContract would throw", () => {
    expect(findDeployedContract(295, "AcmeVaultV2")).toBeNull();
    expect(findDeployedContract(296, "TokenAdmin")).toBeNull();
  });
});

describe("resolveGovernanceConfig", () => {
  afterEach(() => vi.unstubAllEnvs());

  const stubIds = () => {
    vi.stubEnv("NEXT_PUBLIC_GOVERNANCE_ACCOUNT_ID", "0.0.10671146");
    vi.stubEnv("NEXT_PUBLIC_DEMO_TOKEN_ID", "0.0.10671333");
    vi.stubEnv("NEXT_PUBLIC_SEED_PROPOSAL_ID", "3");
  };

  it("names the network and the contracts the governance screens read", () => {
    stubIds();
    const config = resolveGovernanceConfig(295);
    expect(config.network).toBe("mainnet");
    expect(config.governanceAccountId).toBe("0.0.10671146");
    expect(config.executor.hederaContractId).toBe("0.0.1");
    expect(config.vault.hederaContractId).toBe("0.0.2");
  });

  it("does not require the vault's next implementation, so the screens render without it", () => {
    stubIds();
    expect(resolveGovernanceConfig(295)).not.toHaveProperty("vaultNextImplementation");
  });

  it("throws the deploy's message when one of them is missing", () => {
    stubIds();
    expect(() => resolveGovernanceConfig(296)).toThrow(/AcmeVault is not deployed on chain 296/);
  });
});

describe("GOVERNANCE_ROUTES", () => {
  it("builds a proposal path from its schedule id", () => {
    expect(GOVERNANCE_ROUTES.proposal("0.0.777")).toBe("/governance/0.0.777");
  });
});
