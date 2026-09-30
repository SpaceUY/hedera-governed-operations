// @vitest-environment node
import type { ProposalDraft } from "./draft";
import { previewDraft } from "./draft";
import { draftTreasuryTransfer } from "./treasuryTransfer";
import { describe, expect, it } from "vitest";

const TREASURY = "0.0.10671146";
const RECIPIENT = "0.0.500";

const nativeScheduled = (draft: ProposalDraft) => {
  const preview = previewDraft(draft);
  if (preview.path !== "native") throw new Error("expected a native preview");
  return preview.scheduled;
};

describe("draftTreasuryTransfer", () => {
  it("previews an HBAR transfer out of the treasury, naming the recipient as the target", () => {
    const draft = draftTreasuryTransfer(TREASURY, { recipientAccountId: RECIPIENT, amount: "1.5" });

    expect(draft).toMatchObject({ path: "native", kind: "treasuryTransfer", target: `Recipient · ${RECIPIENT}` });
    const scheduled = nativeScheduled(draft);
    if (scheduled.kind !== "treasuryTransfer") throw new Error("expected a transfer");
    expect(scheduled.hbar).toEqual(
      expect.arrayContaining([
        { accountId: TREASURY, tinybars: -150_000_000n },
        { accountId: RECIPIENT, tinybars: 150_000_000n },
      ]),
    );
  });

  it("builds a fresh transaction for every call", () => {
    const draft = draftTreasuryTransfer(TREASURY, { recipientAccountId: RECIPIENT, amount: "1" });
    if (draft.path !== "native") throw new Error("expected a native draft");
    expect(draft.buildInnerTransaction()).not.toBe(draft.buildInnerTransaction());
  });

  it("refuses an amount finer than a tinybar instead of rounding it", () => {
    expect(() => draftTreasuryTransfer(TREASURY, { recipientAccountId: RECIPIENT, amount: "1.123456789" })).toThrow(
      /8 decimal places/,
    );
  });

  it("refuses zero", () => {
    expect(() => draftTreasuryTransfer(TREASURY, { recipientAccountId: RECIPIENT, amount: "0" })).toThrow(
      /more than zero/,
    );
  });

  it("refuses a transfer from the treasury to itself", () => {
    expect(() => draftTreasuryTransfer(TREASURY, { recipientAccountId: TREASURY, amount: "1" })).toThrow(
      /treasury itself/,
    );
  });

  it("moves an HTS token in its smallest unit, from the decimals it was given", () => {
    const draft = draftTreasuryTransfer(TREASURY, {
      recipientAccountId: RECIPIENT,
      amount: "1.5",
      asset: { kind: "token", tokenId: "0.0.5449", decimals: 6 },
    });

    const scheduled = nativeScheduled(draft);
    if (scheduled.kind !== "treasuryTransfer") throw new Error("expected a transfer");
    expect(scheduled.hbar).toEqual([]);
    expect(scheduled.tokens).toEqual(
      expect.arrayContaining([
        { tokenId: "0.0.5449", accountId: TREASURY, amount: -1_500_000n },
        { tokenId: "0.0.5449", accountId: RECIPIENT, amount: 1_500_000n },
      ]),
    );
  });

  it("refuses a token amount finer than the token's decimals instead of rounding it", () => {
    expect(() =>
      draftTreasuryTransfer(TREASURY, {
        recipientAccountId: RECIPIENT,
        amount: "1.5",
        asset: { kind: "token", tokenId: "0.0.9000", decimals: 0 },
      }),
    ).toThrow(/0 decimal places/);
  });
});
