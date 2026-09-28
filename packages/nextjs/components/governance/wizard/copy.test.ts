import { PROPOSAL_KIND_COPY, approverLabel, expiryLabel, gasLimitLabel, openProposalCopy } from "./copy";
import { MAX_SCHEDULE_MEMO_BYTES } from "@sh/core/governance/schedules";
import { describe, expect, it } from "vitest";

describe("wizard words", () => {
  const council = { threshold: 2, memberKeys: ["a", "b", "c"] };

  it("says a scheduled call's gas is charged in full, and a native one has none", () => {
    expect(gasLimitLabel(150_000)).toBe(`${(150_000).toLocaleString()} — charged in full on success`);
    expect(gasLimitLabel(null)).toBe("n/a — native, network fee only");
  });

  it("states the expiry in days from the constant it is given", () => {
    expect(expiryLabel(7 * 24 * 60 * 60)).toBe("7 days after scheduling. Unsigned, it simply lapses.");
  });

  it("does not call registering an approval, and says nothing about registering for a native kind", () => {
    expect(approverLabel("upgrade", council)).toBe("The 2-of-3 council. Registering the proposal is not an approval.");
    expect(approverLabel("treasuryTransfer", council)).toBe("The 2-of-3 council.");
  });

  it("names one or two transactions depending on the path", () => {
    expect(openProposalCopy("upgrade").cta).toBe("Register and schedule with your wallet");
    expect(openProposalCopy("treasuryTransfer").cta).toBe("Schedule with your wallet");
  });
});

describe("PROPOSAL_KIND_COPY", () => {
  it("gives every kind a title that fits a schedule memo", () => {
    for (const { title } of Object.values(PROPOSAL_KIND_COPY)) {
      expect(new TextEncoder().encode(title).length).toBeLessThanOrEqual(MAX_SCHEDULE_MEMO_BYTES);
    }
  });
});
