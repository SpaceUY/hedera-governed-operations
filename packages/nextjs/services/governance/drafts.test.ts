// @vitest-environment node
import {
  type DraftPreview,
  type ProposalDraft,
  draftTreasurySwap,
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
const ADAPTER = "0x0000000000000000000000000000000000ada97e" as const;
/** Testnet USDC, `0.0.5449`, as the EVM sees it. Six decimal places, not HBAR's eight. */
const USDC = "0x0000000000000000000000000000000000001549" as const;
const USDC_DECIMALS = 6;
const TREASURY_EVM = "0x00000000000000000000000000000000009eC3ea" as const;
const SWAP_TARGETS = {
  adapter: ADAPTER,
  adapterContractId: "0.0.11380350",
  tokenOut: USDC,
  recipient: TREASURY_EVM,
  fee: 3000,
};
const swapValues = { amountIn: "50", floor: "6.25", floorDecimals: USDC_DECIMALS };

const swapPreview = (values = swapValues) => {
  const preview = previewDraft(draftTreasurySwap(SWAP_TARGETS, values));
  if (preview.path !== "registry") throw new Error("expected a registry preview");
  const { operation } = preview;
  if (operation.kind !== "treasurySwap") throw new Error("expected a treasury swap");
  return { ...preview, operation };
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

describe("draftTreasurySwap", () => {
  it("sends the adapter the pool, the token and the treasury as the recipient of the output", () => {
    const preview = swapPreview();

    expect(preview.target).toBe("Swap adapter · 0.0.11380350");
    expect(preview.operation.tokenOut.toLowerCase()).toBe(USDC.toLowerCase());
    expect(preview.operation.recipient.toLowerCase()).toBe(TREASURY_EVM.toLowerCase());
    expect(preview.operation.fee).toBe(3000);
  });

  it("reads the floor in the output token's decimals and the amount in HBAR's", () => {
    const { operation } = swapPreview();

    expect(operation.amountInTinybars).toBe(5_000_000_000n);
    expect(operation.amountOutMinimum).toBe(6_250_000n);
  });

  it("pays exactly the HBAR its calldata sells, which is what the adapter requires", () => {
    const preview = swapPreview();

    expect(preview.payableTinybars).toBe(preview.operation.amountInTinybars);
  });

  it("charges the gas measured for a swap through the executor, the adapter and the router", () => {
    expect(swapPreview().executeGas).toBe(PROPOSAL_TYPES.treasurySwap.executeGas);
  });

  it("gives the swap the proposal's own expiry as its deadline, not the moment it was drafted", () => {
    const { operation } = swapPreview();

    expect(operation.deadline).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it.each(["", "  ", "0"])("refuses a missing or zero amount to sell (%j)", amountIn => {
    expect(() => draftTreasurySwap(SWAP_TARGETS, { ...swapValues, amountIn })).toThrow(/sells|more than zero/i);
  });

  it.each(["", "  ", "0"])("refuses a missing or zero floor (%j)", floor => {
    expect(() => draftTreasurySwap(SWAP_TARGETS, { ...swapValues, floor })).toThrow(/floor/i);
  });

  it("refuses a floor finer than the output token instead of rounding it away", () => {
    expect(() => draftTreasurySwap(SWAP_TARGETS, { ...swapValues, floor: "6.2500001" })).toThrow(/6 decimal places/);
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

  it("names the adapter call a swap goes through", () => {
    expect(previewFunctionLabel(swapPreview())).toBe("swapExactHbarForToken(…)");
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
