import { type UnscheduledEntry, isEntryFor } from "./unscheduledEntry";
import { describe, expect, it } from "vitest";

const ENTRY: UnscheduledEntry = {
  executorContractId: "0.0.4242",
  target: "0x00000000000000000000000000000000000A11cE",
  calldata: "0xABCDEF",
  registrationTransactionId: "0.0.1001@1.0",
  registryProposalId: 12,
};

describe("isEntryFor", () => {
  it("matches the same call on the same executor, whatever the casing", () => {
    expect(
      isEntryFor(ENTRY, "0.0.4242", { target: "0x00000000000000000000000000000000000a11ce", calldata: "0xabcdef" }),
    ).toBe(true);
  });

  it("does not match another call, another executor, or no entry", () => {
    expect(isEntryFor(ENTRY, "0.0.4242", { target: ENTRY.target as `0x${string}`, calldata: "0xabcdee" })).toBe(false);
    expect(isEntryFor(ENTRY, "0.0.9999", { target: ENTRY.target as `0x${string}`, calldata: "0xabcdef" })).toBe(false);
    expect(isEntryFor(null, "0.0.4242", { target: ENTRY.target as `0x${string}`, calldata: "0xabcdef" })).toBe(false);
  });
});
