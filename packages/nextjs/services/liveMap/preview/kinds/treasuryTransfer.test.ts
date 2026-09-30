import { GOVERNANCE, KNOWN_TOKEN, PREVIEW_CONTEXT, SKETCH_CONTEXT, SUPPLIER } from "./previewFixtures";
import { TREASURY_TRANSFER_PREVIEW } from "./treasuryTransfer";
import { describe, expect, it } from "vitest";

const transfer = (
  hbar: Array<{ accountId: string; tinybars: bigint }>,
  tokens: Array<{ tokenId: string; accountId: string; amount: bigint }> = [],
) => ({ kind: "treasuryTransfer" as const, hbar, tokens });

describe("TREASURY_TRANSFER_PREVIEW", () => {
  it("puts what each credited account would receive on it, and nothing on the treasury", () => {
    const pay = transfer([
      { accountId: GOVERNANCE, tinybars: -4_000_000_000n },
      { accountId: SUPPLIER, tinybars: 4_000_000_000n },
    ]);
    expect(TREASURY_TRANSFER_PREVIEW.labels(pay, PREVIEW_CONTEXT)).toEqual([
      { ref: SUPPLIER, text: "would receive 40 ℏ" },
    ]);
  });

  it("writes a token amount with the decimals and symbol the app read for it, joined to the HBAR", () => {
    const pay = transfer(
      [
        { accountId: GOVERNANCE, tinybars: -4_000_000_000n },
        { accountId: SUPPLIER, tinybars: 4_000_000_000n },
      ],
      [
        { tokenId: KNOWN_TOKEN, accountId: GOVERNANCE, amount: -1234n },
        { tokenId: KNOWN_TOKEN, accountId: SUPPLIER, amount: 1234n },
      ],
    );
    expect(TREASURY_TRANSFER_PREVIEW.labels(pay, PREVIEW_CONTEXT)).toEqual([
      { ref: SUPPLIER, text: "would receive 40 ℏ and 12.34 GOVD" },
    ]);
  });

  it("does not guess an amount for a token whose decimals it has not read", () => {
    const pay = transfer(
      [],
      [
        { tokenId: "0.0.6001", accountId: GOVERNANCE, amount: -5n },
        { tokenId: "0.0.6001", accountId: SUPPLIER, amount: 5n },
      ],
    );
    expect(TREASURY_TRANSFER_PREVIEW.labels(pay, PREVIEW_CONTEXT)).toEqual([
      { ref: SUPPLIER, text: "would receive a payment" },
    ]);
  });

  it("sketches a payment to whoever the form will name, which would receive a payment", () => {
    expect(TREASURY_TRANSFER_PREVIEW.sketch(SKETCH_CONTEXT)).toEqual({
      refs: {},
      words: [{ role: "recipient", text: "would receive a payment" }],
    });
  });
});
