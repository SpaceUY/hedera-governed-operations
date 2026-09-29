// @vitest-environment node
import { type DraftPreview, isPreviewRecognized, previewDraft, previewFunctionLabel, tryDraft } from "./draft";
import { draftTreasuryTransfer } from "./treasuryTransfer";
import { draftVaultUpgrade } from "./vaultUpgrade";
import { parseAbi } from "viem";
import { describe, expect, it } from "vitest";

const TREASURY = "0.0.10671146";
const RECIPIENT = "0.0.500";
const PROXY = "0x00000000000000000000000000000000000A11cE" as const;
const UPGRADE_TARGETS = {
  proxy: PROXY,
  proxyContractId: "0.0.4260",
  implementation: "0x00000000000000000000000000000000000B0b00" as const,
  implementationAbi: parseAbi(["function initV2(uint256 limit)"]),
};

describe("previewFunctionLabel", () => {
  it("names the upgrade call and its implementation", () => {
    const preview = previewDraft(draftVaultUpgrade(UPGRADE_TARGETS, { withdrawalLimit: "10" }));
    expect(previewFunctionLabel(preview)).toMatch(/^upgradeToAndCall\(address,bytes\) → 0x/i);
  });

  it("names a native transfer", () => {
    const preview = previewDraft(draftTreasuryTransfer(TREASURY, { recipientAccountId: RECIPIENT, amount: "1" }));
    expect(previewFunctionLabel(preview)).toBe("CryptoTransfer (native scheduled transaction)");
  });
});

describe("tryDraft", () => {
  it("turns a thrown error into an invalid result", () => {
    expect(
      tryDraft(() => {
        throw new Error("bad input");
      }),
    ).toEqual({ status: "invalid", message: "bad input" });
  });
});

describe("isPreviewRecognized", () => {
  it("is false for a body the decoder cannot read", () => {
    const native: DraftPreview = {
      path: "native",
      kind: "treasuryTransfer",
      target: "x",
      scheduled: { kind: "unrecognized", reason: "x" },
    };
    const registry: DraftPreview = {
      path: "registry",
      kind: "upgrade",
      target: "x",
      operation: { kind: "unrecognized", target: PROXY, calldata: "0x", reason: "x" },
      executeGas: 1,
      payableTinybars: 0n,
      calldata: "0x",
    };
    expect(isPreviewRecognized(native)).toBe(false);
    expect(isPreviewRecognized(registry)).toBe(false);
  });
});
