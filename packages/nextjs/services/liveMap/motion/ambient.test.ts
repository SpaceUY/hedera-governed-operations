import { driftOf } from "./ambient";
import { AMBIENT_MS } from "./timings";
import { describe, expect, it } from "vitest";

const IDS = [
  "governanceAccount",
  "executor",
  "vault",
  "tokenAdmin",
  "member:YWxpY2U=",
  "member:Ym9i",
  "proposer:0.0.4001",
];

describe("driftOf", () => {
  it("gives every node a period between 8 and 14 s and a phase within it", () => {
    for (const id of IDS) {
      const { periodMs, phaseMs } = driftOf(id);
      expect(periodMs).toBeGreaterThanOrEqual(AMBIENT_MS.driftMin);
      expect(periodMs).toBeLessThanOrEqual(AMBIENT_MS.driftMax);
      expect(phaseMs).toBeGreaterThanOrEqual(0);
      expect(phaseMs).toBeLessThan(periodMs);
    }
  });

  it("keeps the nodes out of step, and each node the same whatever else is on the map", () => {
    const periods = IDS.map(id => driftOf(id).periodMs);
    expect(new Set(periods).size).toBe(IDS.length);
    expect(driftOf("vault")).toEqual(driftOf("vault"));
  });
});
