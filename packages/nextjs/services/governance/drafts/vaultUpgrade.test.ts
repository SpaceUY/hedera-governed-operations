// @vitest-environment node
import { previewDraft } from "./draft";
import { draftVaultUpgrade } from "./vaultUpgrade";
import { PROPOSAL_TYPES, describeRegistryOperation } from "@sh/core/governance/proposalTypes";
import { decodeFunctionData, parseAbi } from "viem";
import { describe, expect, it } from "vitest";

const PROXY = "0x00000000000000000000000000000000000A11cE" as const;
const IMPLEMENTATION = "0x00000000000000000000000000000000000B0b00" as const;
const V2_ABI = parseAbi(["function initV2(uint256 limit)"]);
const UPGRADE_TARGETS = {
  proxy: PROXY,
  proxyContractId: "0.0.4260",
  implementation: IMPLEMENTATION,
  implementationAbi: V2_ABI,
};

describe("draftVaultUpgrade", () => {
  it("upgrades the proxy and sets the withdrawal limit in the same call", () => {
    const preview = previewDraft(draftVaultUpgrade(UPGRADE_TARGETS, { withdrawalLimit: "10" }));
    if (preview.path !== "registry" || preview.operation.kind !== "upgrade") throw new Error("expected an upgrade");

    expect(preview.target).toBe("Vault · 0.0.4260");
    expect(preview.operation.implementation.toLowerCase()).toBe(IMPLEMENTATION.toLowerCase());
    expect(preview.executeGas).toBe(PROPOSAL_TYPES.upgrade.executeGas);
    expect(preview.payableTinybars).toBe(0n);
    expect(preview.calldata).toMatch(/^0x[0-9a-f]+$/);
    expect(decodeFunctionData({ abi: V2_ABI, data: preview.operation.initializerCalldata as `0x${string}` })).toEqual({
      functionName: "initV2",
      args: [1_000_000_000n],
    });
    expect(preview.operation.initializer).toEqual({ kind: "setWithdrawalLimit", limitTinybars: 1_000_000_000n });
    expect(describeRegistryOperation(preview.operation)).toContain("setting the withdrawal limit to 10 ℏ");
  });

  it.each(["", "  ", "0"])("refuses a missing or zero withdrawal limit (%j)", withdrawalLimit => {
    expect(() => draftVaultUpgrade(UPGRADE_TARGETS, { withdrawalLimit })).toThrow(/withdrawal limit/i);
  });
});
