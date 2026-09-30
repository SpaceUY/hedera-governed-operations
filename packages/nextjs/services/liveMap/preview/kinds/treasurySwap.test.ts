import { ADAPTER, GOVERNANCE, PREVIEW_CONTEXT, SKETCH_CONTEXT } from "./previewFixtures";
import { TREASURY_SWAP_PREVIEW } from "./treasurySwap";
import { describe, expect, it } from "vitest";

describe("TREASURY_SWAP_PREVIEW", () => {
  it("puts the HBAR it would sell on the adapter", () => {
    const swap = {
      kind: "treasurySwap" as const,
      target: ADAPTER,
      tokenOut: "0x0000000000000000000000000000000000001770",
      fee: 1500,
      recipient: "0x0000000000000000000000000000000000000fa0",
      amountInTinybars: 25_000_000_000n,
      amountOutMinimum: 1n,
      deadline: 1_790_000_000,
    };
    expect(TREASURY_SWAP_PREVIEW.labels(swap, PREVIEW_CONTEXT)).toEqual([{ ref: ADAPTER, text: "would sell 250 ℏ" }]);
  });

  it("sketches the way through the configured adapter back to the treasury, with no amount", () => {
    expect(TREASURY_SWAP_PREVIEW.sketch(SKETCH_CONTEXT)).toEqual({
      refs: { subject: [ADAPTER], recipient: [GOVERNANCE] },
      words: [{ role: "subject", text: "would sell HBAR" }],
    });
  });
});
