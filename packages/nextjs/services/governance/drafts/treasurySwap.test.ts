// @vitest-environment node
import { previewDraft, previewFunctionLabel } from "./draft";
import { draftTreasurySwap } from "./treasurySwap";
import { PROPOSAL_TYPES } from "@sh/core/governance/proposalTypes";
import { describe, expect, it } from "vitest";

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

  it("names the adapter call a swap goes through", () => {
    expect(previewFunctionLabel(swapPreview())).toBe("swapExactHbarForToken(…)");
  });
});
