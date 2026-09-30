import { PREVIEW_CONTEXT, SKETCH_CONTEXT, VAULT_ID } from "./previewFixtures";
import { PREVIEW_KINDS, previewLabelsOf, sketchOf } from "./registry";
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

  it("sketches a picked kind through its own module", () => {
    expect(sketchOf("upgrade", SKETCH_CONTEXT)).toEqual({
      kind: "sketch",
      of: "upgrade",
      refs: { subject: [VAULT_ID] },
      words: [{ role: "subject", text: "would be upgraded" }],
    });
  });
});
