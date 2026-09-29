import { NEXT_RELEASE, PREVIEW_CONTEXT, VAULT } from "./previewFixtures";
import { UPGRADE_PREVIEW } from "./upgrade";
import { describe, expect, it } from "vitest";

const upgradeTo = (implementation: string) => ({
  kind: "upgrade" as const,
  target: VAULT,
  implementation,
  initializerCalldata: "0x",
  initializer: { kind: "none" as const },
});

describe("UPGRADE_PREVIEW", () => {
  it("says the vault would become v2 when the implementation is its next release, in any case", () => {
    expect(UPGRADE_PREVIEW.labels(upgradeTo(NEXT_RELEASE.toLowerCase()), PREVIEW_CONTEXT)).toEqual([
      { ref: VAULT, text: "would become v2" },
    ]);
  });

  it("claims no version for an implementation the deployment did not record", () => {
    expect(UPGRADE_PREVIEW.labels(upgradeTo("0x00000000000000000000000000000000000000b1"), PREVIEW_CONTEXT)).toEqual([
      { ref: VAULT, text: "would be upgraded" },
    ]);
  });
});
