import { longZeroAddress, sameAddress } from "./identity";
import { describe, expect, it } from "vitest";

describe("longZeroAddress", () => {
  it("writes the entity number as the 20-byte address it answers to, whatever kind of entity it is", () => {
    expect(longZeroAddress("0.0.5449")).toBe("0x0000000000000000000000000000000000001549");
    expect(longZeroAddress("0.0.10671146")).toBe("0x0000000000000000000000000000000000a2d42a");
  });

  it("refuses anything that is not a shard.realm.num id rather than guessing", () => {
    expect(() => longZeroAddress("0x0000000000000000000000000000000000001549")).toThrow(/shard\.realm\.num/);
    expect(() => longZeroAddress("")).toThrow(/shard\.realm\.num/);
  });
});

describe("sameAddress", () => {
  it("ignores the casing of a checksummed address", () => {
    expect(
      sameAddress("0x3cd48d7eAAD9e9b6E2DAaA14862aFDa5811f62Fe", "0x3cd48d7eaad9e9b6e2daaa14862afda5811f62fe"),
    ).toBe(true);
  });

  it("tells two different addresses apart", () => {
    expect(
      sameAddress("0x0000000000000000000000000000000000001549", "0x0000000000000000000000000000000000a2d42a"),
    ).toBe(false);
  });
});
