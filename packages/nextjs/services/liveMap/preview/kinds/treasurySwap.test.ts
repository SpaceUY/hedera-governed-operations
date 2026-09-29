import { PREVIEW_CONTEXT } from "./previewFixtures";
import { TREASURY_SWAP_PREVIEW } from "./treasurySwap";
import { describe, expect, it } from "vitest";

const ADAPTER = "0x5aF0000000000000000000000000000000000003";

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
});
