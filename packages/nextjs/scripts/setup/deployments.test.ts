import { HEDERA_TESTNET_CHAIN_ID, readGovernanceDeployment } from "./deployments";
import { describe, expect, it } from "vitest";

const contract = (address: string, hederaContractId?: string) => ({
  address,
  abi: [],
  ...(hederaContractId ? { hederaContractId } : {}),
});

const onChain: Record<string, { address: string; abi: never[]; hederaContractId?: string }> = {
  GovernedExecutor: contract("0x01", "0.0.1"),
  AcmeVault: contract("0x02"),
  AcmeVaultV2: contract("0x03"),
  SaucerSwapAdapter: contract("0x04"),
  TokenAdmin: contract("0x05", "0.0.5"),
};

const deployed = { [HEDERA_TESTNET_CHAIN_ID]: onChain };

const without = (name: string) => {
  const { [name]: removed, ...rest } = onChain;
  void removed;
  return { [HEDERA_TESTNET_CHAIN_ID]: rest };
};

describe("readGovernanceDeployment", () => {
  it("reports every contract as missing when nothing is deployed", () => {
    expect(readGovernanceDeployment({})).toEqual({
      ready: false,
      missing: ["GovernedExecutor", "AcmeVault", "AcmeVaultV2", "SaucerSwapAdapter", "TokenAdmin"],
    });
  });

  it("reports only the contract that is missing from a partial deployment", () => {
    expect(readGovernanceDeployment(without("TokenAdmin"))).toEqual({ ready: false, missing: ["TokenAdmin"] });
  });

  it("is not ready while the executor has no native contract id", () => {
    const noId = { [HEDERA_TESTNET_CHAIN_ID]: { ...onChain, GovernedExecutor: contract("0x01") } };
    expect(readGovernanceDeployment(noId)).toEqual({ ready: false, missing: ["GovernedExecutor"] });
  });

  it("ignores deployments made against another chain", () => {
    expect(readGovernanceDeployment({ 31337: onChain }).ready).toBe(false);
  });

  it("returns the addresses and native ids a complete deployment carries", () => {
    expect(readGovernanceDeployment(deployed)).toEqual({
      ready: true,
      deployment: {
        executorEvm: "0x01",
        executorContractId: "0.0.1",
        vaultProxyEvm: "0x02",
        vaultV2Evm: "0x03",
        tokenAdminContractId: "0.0.5",
      },
    });
  });
});
