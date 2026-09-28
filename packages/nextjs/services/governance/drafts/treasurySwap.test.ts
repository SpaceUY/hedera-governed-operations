// @vitest-environment node
import { previewDraft } from "./draft";
import { draftTreasurySwap } from "./treasurySwap";
import { PROPOSAL_TYPES } from "@sh/core/governance/proposalTypes";
import { PROPOSAL_EXPIRY_SECONDS } from "@sh/core/governance/schedules";
import { describe, expect, it } from "vitest";

const SWAP_TARGETS = {
  adapter: "0x00000000000000000000000000000000000005A9" as const,
  adapterContractId: "0.0.4400",
  governanceAccountId: "0.0.10671146",
  tokenOutId: "0.0.5449",
  fee: 3000,
};

const swapPreview = (values: { amount: string; floor: string }) => {
  const preview = previewDraft(draftTreasurySwap(SWAP_TARGETS, { ...values, tokenOutDecimals: 6 }));
  if (preview.path !== "registry" || preview.operation.kind !== "treasurySwap") throw new Error("expected a swap");
  return { preview, operation: preview.operation };
};

describe("draftTreasurySwap", () => {
  it("sells tinybars for a floor in the token's own units, paid out to the treasury", () => {
    const { preview, operation } = swapPreview({ amount: "2.5", floor: "0.43" });

    expect(preview.target).toBe("Swap adapter · 0.0.4400");
    expect(operation.amountInTinybars).toBe(250_000_000n);
    expect(operation.amountOutMinimum).toBe(430_000n);
    expect(operation.tokenOut.toLowerCase()).toBe("0x0000000000000000000000000000000000001549");
    expect(operation.recipient.toLowerCase()).toBe("0x0000000000000000000000000000000000a2d42a");
    expect(operation.fee).toBe(3000);
    expect(preview.payableTinybars).toBe(250_000_000n);
    expect(preview.executeGas).toBe(PROPOSAL_TYPES.treasurySwap.executeGas);
  });

  it("leaves the deadline to the encoder: the proposal's own expiry", () => {
    const before = Math.floor(Date.now() / 1000);
    const { operation } = swapPreview({ amount: "1", floor: "0.1" });
    expect(operation.deadline).toBeGreaterThanOrEqual(before + PROPOSAL_EXPIRY_SECONDS);
  });

  it("refuses a floor of zero with the encoder's reason", () => {
    expect(() => draftTreasurySwap(SWAP_TARGETS, { amount: "1", floor: "0", tokenOutDecimals: 6 })).toThrow(
      /no floor accepts any price/,
    );
  });

  it("refuses a floor finer than the token's decimals instead of rounding it", () => {
    expect(() => draftTreasurySwap(SWAP_TARGETS, { amount: "1", floor: "0.1234567", tokenOutDecimals: 6 })).toThrow(
      /6 decimal places/,
    );
  });
});
