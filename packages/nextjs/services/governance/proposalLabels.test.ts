import { approvalsLabel, registryLabel, scheduleStatusLabel } from "./proposalLabels";
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
