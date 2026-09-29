import { COUNCIL_ROTATION_PREVIEW } from "./councilRotation";
import { GOVERNANCE, PREVIEW_CONTEXT, SEAT_A, SEAT_B, SEAT_C, SEAT_D } from "./previewFixtures";
import { describe, expect, it } from "vitest";

const rotateTo = (threshold: number, memberKeys: string[]) => ({
  kind: "councilRotation" as const,
  accountId: GOVERNANCE,
  council: { threshold, memberKeys },
});

describe("COUNCIL_ROTATION_PREVIEW", () => {
  it("says which seats would join and which would leave", () => {
    expect(COUNCIL_ROTATION_PREVIEW.labels(rotateTo(2, [SEAT_A, SEAT_B, SEAT_D]), PREVIEW_CONTEXT)).toEqual([
      { ref: SEAT_D, text: "would join the council" },
      { ref: SEAT_C, text: "would leave the council" },
    ]);
  });

  it("puts no words on a seat when only the threshold changes", () => {
    expect(COUNCIL_ROTATION_PREVIEW.labels(rotateTo(3, [SEAT_A, SEAT_B, SEAT_C]), PREVIEW_CONTEXT)).toEqual([]);
  });
});
