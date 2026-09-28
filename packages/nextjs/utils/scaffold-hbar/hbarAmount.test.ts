import { HBAR_DECIMALS, formatTinybars, parseAmount } from "./hbarAmount";
import { describe, expect, it } from "vitest";

describe("parseAmount", () => {
  it("converts to the smallest unit", () => {
    expect(parseAmount("1.5", HBAR_DECIMALS)).toBe(150_000_000n);
    expect(parseAmount(" 2 ", HBAR_DECIMALS)).toBe(200_000_000n);
    expect(parseAmount("1.25", 2)).toBe(125n);
    expect(parseAmount("0", HBAR_DECIMALS)).toBe(0n);
  });

  it("refuses more decimals than the asset has instead of rounding", () => {
    expect(() => parseAmount("1.123456789", HBAR_DECIMALS)).toThrow(/8 decimal places/);
    expect(() => parseAmount("1.5", 0)).toThrow(/0 decimal places/);
  });

  it.each(["", " ", "-1", "1e2", "0x8", "1.", ".5", "1,5", "1.2.3"])("refuses %j", text => {
    expect(() => parseAmount(text, HBAR_DECIMALS)).toThrow(/is not an amount/);
  });
});

describe("formatTinybars", () => {
  it("formats every accepted input type the same way", () => {
    expect(formatTinybars(150_000_000n)).toBe("1.5 ℏ");
    expect(formatTinybars(150_000_000)).toBe("1.5 ℏ");
    expect(formatTinybars("150000000")).toBe("1.5 ℏ");
  });

  it.each([
    [0n, "0 ℏ"],
    [1n, "0.00000001 ℏ"],
    [100n, "0.000001 ℏ"],
    [123_456_789_012_345_678n, "1234567890.12345678 ℏ"],
  ])("writes %s tinybars in ℏ, in plain decimals and without rounding", (tinybars, expected) => {
    expect(formatTinybars(tinybars)).toBe(expected);
  });

  it("reads back to the same tinybars", () => {
    const tinybars = 987_654_321n;
    expect(parseAmount(formatTinybars(tinybars).replace(" ℏ", ""), HBAR_DECIMALS)).toBe(tinybars);
  });
});
