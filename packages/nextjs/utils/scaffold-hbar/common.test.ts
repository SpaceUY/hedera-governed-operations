import { replacer } from "./common";
import { describe, expect, it } from "vitest";

describe("replacer", () => {
  it("serializes bigint values as strings", () => {
    expect(JSON.stringify({ amount: 10n }, replacer)).toBe('{"amount":"10"}');
  });

  it("leaves other values untouched", () => {
    expect(JSON.stringify({ id: "0.0.1", count: 2 }, replacer)).toBe('{"id":"0.0.1","count":2}');
  });
});
