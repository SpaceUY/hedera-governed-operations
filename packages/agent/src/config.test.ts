import { parsePolicy } from "./config";
import { describe, expect, it } from "vitest";

const VAULT = "0x0000000000000000000000000000000000001234";

const policyOf = (rules: Record<string, unknown>): string => JSON.stringify(rules);

describe("parsePolicy", () => {
  it("reads a rule per kind and leaves the kinds it does not mention out", () => {
    const policy = parsePolicy(policyOf({ tokenAdmin: { operations: ["pause", "unpause"], tokens: [VAULT] } }));
    expect(policy.tokenAdmin).toEqual({ operations: ["pause", "unpause"], tokens: [VAULT] });
    expect(policy.upgrade).toBeUndefined();
    expect(policy.treasurySwap).toBeUndefined();
  });

  it("reads an amount as tinybars out of a string, so a balance above 2^53 survives the parse", () => {
    const policy = parsePolicy(
      policyOf({ treasuryTransfer: { maxTinybars: "90071992547409910", recipients: ["0.0.7"] } }),
    );
    expect(policy.treasuryTransfer?.maxTinybars).toBe(90071992547409910n);
  });

  it("refuses an amount written as a JSON number, which would already have rounded", () => {
    expect(() => parsePolicy(policyOf({ treasuryTransfer: { maxTinybars: 100, recipients: ["0.0.7"] } }))).toThrow(
      /tinybars in a string/,
    );
  });

  it("refuses a rule name nothing reads, because its author believes that limit is in force", () => {
    expect(() => parsePolicy(policyOf({ treasurySwaps: {} }))).toThrow(/no rule named treasurySwaps/);
    expect(() =>
      parsePolicy(policyOf({ tokenAdmin: { operations: ["pause"], tokens: [VAULT], maxAmount: "1" } })),
    ).toThrow(/no rule named maxAmount/);
  });

  it("refuses an empty allowlist, which reads as permissive and is not", () => {
    expect(() => parsePolicy(policyOf({ tokenAdmin: { operations: ["pause"], tokens: [] } }))).toThrow(/is empty/);
  });

  it("refuses a token operation the contract has no method for", () => {
    expect(() => parsePolicy(policyOf({ tokenAdmin: { operations: ["burn"], tokens: [VAULT] } }))).toThrow(
      /must be one of pause, unpause, freeze, unfreeze/,
    );
  });

  it("says so when the file is not JSON at all", () => {
    expect(() => parsePolicy("not json")).toThrow(/not valid JSON/);
  });

  it("accepts an empty policy, which allows nothing", () => {
    expect(parsePolicy("{}")).toEqual({});
  });
});
