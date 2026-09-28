import { expiryCountdown } from "./expiryCountdown";
import { describe, expect, it } from "vitest";

const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("expiryCountdown", () => {
  it("is null for a settled proposal, whatever its expiry says", () => {
    expect(expiryCountdown(new Date("2026-01-01T01:00:00.000Z"), false, NOW)).toBeNull();
  });

  it("is null for a pending proposal with no expiry", () => {
    expect(expiryCountdown(null, true, NOW)).toBeNull();
  });

  it("reads normally with more than an hour left", () => {
    expect(expiryCountdown(new Date("2026-01-01T05:00:00.000Z"), true, NOW)).toEqual({
      label: "Expires in 5h 0m",
      urgency: "normal",
    });
  });

  it("intensifies inside the final hour", () => {
    expect(expiryCountdown(new Date("2026-01-01T00:45:00.000Z"), true, NOW)).toEqual({
      label: "Expires in 45m",
      urgency: "final-hour",
    });
  });

  it("reads as expiring now once the deadline has passed", () => {
    expect(expiryCountdown(new Date("2025-12-31T23:00:00.000Z"), true, NOW)).toEqual({
      label: "Expiring now",
      urgency: "final-hour",
    });
  });
});
