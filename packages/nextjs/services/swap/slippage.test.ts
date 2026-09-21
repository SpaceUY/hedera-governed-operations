import { applySlippage } from "./slippage";
import { describe, expect, it } from "vitest";

describe("applySlippage", () => {
  it("returns the full amount at 0 bps", () => {
    expect(applySlippage(1_000_000n, 0)).toBe(1_000_000n);
  });

  it("keeps 99.5% at 50 bps", () => {
    expect(applySlippage(1_000_000n, 50)).toBe(995_000n);
  });

  it("rounds down when the result is not an integer", () => {
    expect(applySlippage(999n, 50)).toBe(994n);
  });

  it("returns zero for a zero amount", () => {
    expect(applySlippage(0n, 50)).toBe(0n);
  });

  it("returns zero at 10000 bps", () => {
    expect(applySlippage(1_000_000n, 10_000)).toBe(0n);
  });

  it("keeps 1 unit intact at 0 bps", () => {
    expect(applySlippage(1n, 0)).toBe(1n);
  });

  it("rounds 1 unit down to zero at 1 bps", () => {
    expect(applySlippage(1n, 1)).toBe(0n);
  });

  it("rejects negative bps", () => {
    expect(() => applySlippage(1n, -1)).toThrow("basis points");
  });

  it("rejects bps above 10000", () => {
    expect(() => applySlippage(1n, 10_001)).toThrow("basis points");
  });

  it("rejects fractional bps", () => {
    expect(() => applySlippage(1n, 0.5)).toThrow("basis points");
  });
});
