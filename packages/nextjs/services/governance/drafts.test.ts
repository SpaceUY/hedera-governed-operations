// @vitest-environment node
import {
  type DraftPreview,
  type ProposalDraft,
  draftTreasuryTransfer,
  draftVaultUpgrade,
  isPreviewRecognized,
  previewDraft,
  previewFunctionLabel,
  tryDraft,
} from "./drafts";
import { PROPOSAL_TYPES, describeRegistryOperation } from "@sh/core/governance/proposalTypes";
import { decodeFunctionData, parseAbi } from "viem";
import { describe, expect, it } from "vitest";

const TREASURY = "0.0.10671146";
const RECIPIENT = "0.0.500";
const PROXY = "0x00000000000000000000000000000000000A11cE" as const;
const IMPLEMENTATION = "0x00000000000000000000000000000000000B0b00" as const;
const V2_ABI = parseAbi(["function initV2(uint256 limit)"]);
const UPGRADE_TARGETS = {
  proxy: PROXY,
  proxyContractId: "0.0.4260",
  implementation: IMPLEMENTATION,
  implementationAbi: V2_ABI,
};

const nativeScheduled = (draft: ProposalDraft) => {
  const preview = previewDraft(draft);
  if (preview.path !== "native") throw new Error("expected a native preview");
  return preview.scheduled;
};

describe("draftTreasuryTransfer", () => {
  it("previews an HBAR transfer out of the treasury, naming the recipient as the target", () => {
    const draft = draftTreasuryTransfer(TREASURY, { recipientAccountId: RECIPIENT, amount: "1.5" });

    expect(draft).toMatchObject({ path: "native", kind: "treasuryTransfer", target: `Recipient · ${RECIPIENT}` });
    const scheduled = nativeScheduled(draft);
    if (scheduled.kind !== "treasuryTransfer") throw new Error("expected a transfer");
    expect(scheduled.hbar).toEqual(
      expect.arrayContaining([
        { accountId: TREASURY, tinybars: -150_000_000n },
        { accountId: RECIPIENT, tinybars: 150_000_000n },
      ]),
    );
  });

  it("builds a fresh transaction for every call", () => {
    const draft = draftTreasuryTransfer(TREASURY, { recipientAccountId: RECIPIENT, amount: "1" });
    if (draft.path !== "native") throw new Error("expected a native draft");
    expect(draft.buildInnerTransaction()).not.toBe(draft.buildInnerTransaction());
  });

  it("refuses an amount finer than a tinybar instead of rounding it", () => {
    expect(() => draftTreasuryTransfer(TREASURY, { recipientAccountId: RECIPIENT, amount: "1.123456789" })).toThrow(
      /8 decimal places/,
    );
  });

  it("refuses zero", () => {
    expect(() => draftTreasuryTransfer(TREASURY, { recipientAccountId: RECIPIENT, amount: "0" })).toThrow(
      /more than zero/,
    );
  });

  it("refuses a transfer from the treasury to itself", () => {
    expect(() => draftTreasuryTransfer(TREASURY, { recipientAccountId: TREASURY, amount: "1" })).toThrow(
      /treasury itself/,
    );
  });
});

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
