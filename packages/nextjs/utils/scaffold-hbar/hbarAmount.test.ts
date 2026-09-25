import { HBAR_DECIMALS, formatTinybars, parseAmount } from "./hbarAmount";
import { Hbar } from "@hiero-ledger/sdk";
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
  it("formats every accepted input type the way the SDK does", () => {
    const expected = Hbar.fromTinybars("150000000").toString();
    expect(formatTinybars(150_000_000n)).toBe(expected);
    expect(formatTinybars(150_000_000)).toBe(expected);
    expect(formatTinybars("150000000")).toBe(expected);
  });
});
