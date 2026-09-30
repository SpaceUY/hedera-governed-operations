import { administersItself, executorHoldersOf, proposerNamesOf } from "./registryRoles";
import { longZeroAddress } from "@sh/core/identity";
import { describe, expect, it } from "vitest";

const TREASURY_ID = "0.0.10671103";
const TREASURY = longZeroAddress(TREASURY_ID);
const EXECUTOR = { address: "0x5aF0000000000000000000000000000000000Abc", hederaContractId: "0.0.10671156" };
const EXECUTOR_LONG_ZERO = longZeroAddress(EXECUTOR.hederaContractId);
const OTHER = "0x00000000000000000000000000000000DeaDBeef";

describe("executorHoldersOf", () => {
  it("says the treasury is the only holder only when it is exactly that", () => {
    expect(executorHoldersOf([TREASURY.toLowerCase()], TREASURY_ID)).toEqual({ status: "treasuryOnly" });
    expect(executorHoldersOf([TREASURY, OTHER], TREASURY_ID)).toEqual({ status: "others", holders: [TREASURY, OTHER] });
    expect(executorHoldersOf([], TREASURY_ID)).toEqual({ status: "others", holders: [] });
  });
});

describe("administersItself", () => {
  it("accepts the executor by its deployment address or its long-zero address, in any case", () => {
    expect(administersItself([EXECUTOR.address.toLowerCase()], EXECUTOR)).toBe(true);
    expect(administersItself([EXECUTOR_LONG_ZERO.toLowerCase()], EXECUTOR)).toBe(true);
    expect(administersItself([EXECUTOR.address, EXECUTOR_LONG_ZERO], EXECUTOR)).toBe(true);
  });

  it("refuses any other admin, and an admin role nobody holds", () => {
    expect(administersItself([EXECUTOR.address, TREASURY], EXECUTOR)).toBe(false);
    expect(administersItself([], EXECUTOR)).toBe(false);
  });
});

describe("proposerNamesOf", () => {
  it("names a proposer as the map names its seat, the viewer as their wallet, and anyone else by account", () => {
    const names = proposerNamesOf(
      [
        { accountId: "0.0.101", key: "key-a" },
        { accountId: "0.0.102", key: "key-b" },
        { accountId: "0.0.103", key: null },
      ],
      { proposers: [], viewerAccountId: "0.0.101", memberNames: { "key-b": { name: "Alice" } } },
    );
    expect(names).toEqual(["Your wallet 0.0.101", "Alice 0.0.102", "0.0.103"]);
  });
});
