import {
  approvalsLabel,
  approverLabel,
  councilRuleLabel,
  expiryLabel,
  gasLimitLabel,
  openProposalCopy,
  registryLabel,
  scheduleStatusLabel,
} from "./proposalLabels";
import type { RegistryCrossCheck } from "./registry";
import { describe, expect, it } from "vitest";

const progress = (signed: number, threshold: number) => ({ signed, threshold, signedBy: [] });

describe("scheduleStatusLabel", () => {
  it.each([
    ["pending", "Collecting signatures"],
    ["executed", "Executed"],
    ["deleted", "Withdrawn"],
    ["expired", "Expired"],
  ] as const)("describes a %s schedule as %s", (status, label) => {
    expect(scheduleStatusLabel(status)).toBe(label);
  });
});

describe("registryLabel", () => {
  it("names the state of an entry that was read", () => {
    const registry = { status: "read", entry: { state: "cancelled" } } as RegistryCrossCheck;
    expect(registryLabel(registry)).toBe("Cancelled");
  });

  it("explains that a native operation has no registry entry", () => {
    expect(registryLabel({ status: "notApplicable" })).toBe("None: the network runs this operation directly");
  });

  it("warns against signing when the registry holds no usable entry", () => {
    expect(registryLabel({ status: "missing", reason: "no entry 7" })).toBe("No usable entry: do not sign");
  });

  it("says the registry could not be read rather than that it has no entry", () => {
    expect(registryLabel({ status: "unreachable", reason: "fetch failed" })).toBe("Could not be read right now");
  });
});

describe("approvalsLabel", () => {
  it("counts council signatures against the threshold", () => {
    expect(approvalsLabel(progress(1, 2), null)).toBe("1 of 2 council signatures");
  });

  it("counts both councils for a rotation, which needs each one's threshold", () => {
    expect(approvalsLabel(progress(2, 2), progress(0, 2))).toBe(
      "Current council: 2 of 2 signatures · Incoming council: 0 of 2 signatures",
    );
  });
});

describe("wizard words", () => {
  const council = { threshold: 2, memberKeys: ["a", "b", "c"] };

  it("states the council rule", () => {
    expect(councilRuleLabel(council)).toBe("2-of-3");
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
