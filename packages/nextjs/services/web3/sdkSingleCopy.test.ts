import { Transaction } from "@hiero-ledger/sdk";
import { buildScheduleSign } from "@sh/core/governance/schedules";
import { describe, expect, it } from "vitest";

// A second physical copy of the SDK type-checks fine and only fails at runtime, inside the wallet
// library's `instanceof`. AGENTS.md §Stack has the install rule this guards.
describe("@hiero-ledger/sdk across workspaces", () => {
  it("builds transactions in @sh/core with the same Transaction class the app and the wallet use", () => {
    expect(buildScheduleSign("0.0.1234")).toBeInstanceOf(Transaction);
  });
});
