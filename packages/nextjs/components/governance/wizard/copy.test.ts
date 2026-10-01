import {
  PROPOSAL_KIND_COPY,
  approverLabel,
  expiryLabel,
  gasLimitLabel,
  lateSubmissionLabel,
  openProposalCopy,
  walletRequestLabel,
} from "./copy";
import { MAX_SCHEDULE_MEMO_BYTES } from "@sh/core/governance/schedules";
import { describe, expect, it } from "vitest";

describe("wizard words", () => {
  const council = { threshold: 2, memberKeys: ["a", "b", "c"] };

  it("titles a council rotation's memo generically, since the rail names the council it proposes", () => {
    expect(PROPOSAL_KIND_COPY.councilRotation.title).toBe("Change the council");
  });

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

describe("walletRequestLabel", () => {
  const register = { action: "register", step: 1, steps: 2, validForSeconds: 120 } as const;

  it("names the step, where to approve it and how long the request stays valid", () => {
    expect(walletRequestLabel(register, "hashpack")).toBe(
      "Step 1 of 2: register the call in the registry. Approve it in your wallet — the request is valid for about 2 minutes.",
    );
    expect(walletRequestLabel({ ...register, action: "schedule", step: 2 }, "hashpack")).toMatch(
      /^Step 2 of 2: schedule the call for the council\. Approve it in your wallet/,
    );
  });

  it("counts a native proposal as its single step", () => {
    expect(walletRequestLabel({ action: "schedule", step: 1, steps: 1, validForSeconds: 120 }, "hashpack")).toMatch(
      /^Step 1 of 1: schedule/,
    );
  });

  it("asks nothing of the test signer, which signs on its own", () => {
    expect(walletRequestLabel(register, "burner")).toBe(
      "Step 1 of 2: register the call in the registry. Signing with the test signer…",
    );
  });
});

describe("lateSubmissionLabel", () => {
  it("names the step and the transaction the network accepted after the wizard stopped waiting", () => {
    expect(lateSubmissionLabel({ action: "schedule", step: 2, steps: 2, transactionId: "0.0.1@1.0" })).toBe(
      "Your wallet sent step 2 of 2 after the wizard stopped waiting, and the network accepted it " +
        "(transaction 0.0.1@1.0). The proposals are refreshed; check them before trying again.",
    );
  });
});
