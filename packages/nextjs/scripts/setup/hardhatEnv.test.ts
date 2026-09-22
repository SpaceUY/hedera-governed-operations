import { hardhatEnvEntries } from "./hardhatEnv";
import { describe, expect, it } from "vitest";

const governance = { accountId: "0.0.99", evmAddress: "0xgov", councilAccountId: "0.0.5" };

describe("hardhatEnvEntries", () => {
  it("hands the deploy the address the executor grants EXECUTOR_ROLE to", () => {
    expect(hardhatEnvEntries(governance, ["0xa"]).GOVERNANCE_ACCOUNT_ADDRESS).toBe("0xgov");
  });

  it("joins the proposers the way the deploy script splits them", () => {
    expect(hardhatEnvEntries(governance, ["0xa", "0xb"]).INITIAL_PROPOSERS).toBe("0xa,0xb");
  });

  it("refuses to hand over an empty proposer list", () => {
    expect(() => hardhatEnvEntries(governance, [])).toThrow(/proposer/i);
  });
});
