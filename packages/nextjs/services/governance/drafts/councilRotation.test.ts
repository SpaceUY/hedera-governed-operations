// @vitest-environment node
import { draftCouncilRotation } from "./councilRotation";
import { previewDraft, previewFunctionLabel } from "./draft";
import { PrivateKey } from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";

const TREASURY = "0.0.10671146";
const keys = (count: number) => Array.from({ length: count }, () => PrivateKey.generateED25519().publicKey);

describe("draftCouncilRotation", () => {
  it("previews the proposed council as the decoder reads it back, on the treasury's own key", () => {
    const memberKeys = keys(4);
    const preview = previewDraft(draftCouncilRotation({ governanceAccountId: TREASURY }, { memberKeys, threshold: 3 }));

    if (preview.path !== "native" || preview.scheduled.kind !== "councilRotation")
      throw new Error("expected a rotation");
    expect(preview.target).toBe(`Treasury key · ${TREASURY}`);
    expect(preview.scheduled.accountId).toBe(TREASURY);
    expect(preview.scheduled.council.threshold).toBe(3);
    expect(preview.scheduled.council.memberKeys).toHaveLength(4);
    expect(previewFunctionLabel(preview)).toBe("AccountUpdate (native) → threshold key");
  });

  it("refuses a threshold the proposed council could never reach, with the encoder's reason", () => {
    expect(() =>
      draftCouncilRotation({ governanceAccountId: TREASURY }, { memberKeys: keys(2), threshold: 3 }),
    ).toThrow(/not reachable by a council of 2/);
  });

  it("refuses the same key listed twice", () => {
    const [key] = keys(1);
    expect(() =>
      draftCouncilRotation({ governanceAccountId: TREASURY }, { memberKeys: [key, key], threshold: 1 }),
    ).toThrow(/same key twice/);
  });
});
