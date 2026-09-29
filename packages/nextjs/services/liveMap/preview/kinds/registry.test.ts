import { PREVIEW_CONTEXT } from "./previewFixtures";
import { PREVIEW_KINDS, previewLabelsOf } from "./registry";
import { describe, expect, it } from "vitest";

describe("PREVIEW_KINDS", () => {
  it("has words for every kind of proposal", () => {
    expect(Object.keys(PREVIEW_KINDS).sort()).toEqual(
      ["councilRotation", "tokenAdmin", "treasurySwap", "treasuryTransfer", "upgrade"].sort(),
    );
  });

  it("hands an operation to its own kind", () => {
    const pause = {
      kind: "tokenAdmin" as const,
      target: "0x5aF0000000000000000000000000000000000002",
      operation: "pause" as const,
      token: "0x0000000000000000000000000000000000001770",
      account: null,
    };
    expect(previewLabelsOf(pause, PREVIEW_CONTEXT)).toEqual([{ ref: pause.token, text: "would be paused" }]);
  });
});
