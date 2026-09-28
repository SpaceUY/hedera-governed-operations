import { approvalPort, confirmationSecret, parsePolicy } from "./config";
import type { Policy } from "./policy";
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

  it("requires an upgrade rule to say how an implementation is trusted", () => {
    // Targets alone would approve any implementation at all for a listed proxy.
    expect(() => parsePolicy(policyOf({ upgrade: { targets: [VAULT] } }))).toThrow(/neither trusts nothing/);
  });

  it("takes a release topic instead of an allowlist, or both", () => {
    const byTopic = parsePolicy(policyOf({ upgrade: { targets: [VAULT], manifestTopicId: "0.0.4242" } }));
    expect(byTopic.upgrade).toMatchObject({ manifestTopicId: "0.0.4242", implementations: undefined });

    const both = parsePolicy(
      policyOf({ upgrade: { targets: [VAULT], implementations: [VAULT], manifestTopicId: "0.0.4242" } }),
    );
    expect(both.upgrade?.implementations).toEqual([VAULT]);
  });

  it("refuses a release topic that is not a 0.0.x id", () => {
    expect(() => parsePolicy(policyOf({ upgrade: { targets: [VAULT], manifestTopicId: "4242" } }))).toThrow(
      /must be a 0.0.x id/,
    );
  });

  it("says so when the file is not JSON at all", () => {
    expect(() => parsePolicy("not json")).toThrow(/not valid JSON/);
  });

  it("accepts an empty policy, which allows nothing", () => {
    expect(parsePolicy("{}")).toEqual({});
  });
});

describe("parsePolicy on the confirmation a rule can ask for", () => {
  it("reads it per rule, so one kind can wait on a person while another does not", () => {
    const policy = parsePolicy(
      policyOf({
        upgrade: { targets: [VAULT], implementations: [VAULT], requireConfirmation: true },
        treasuryTransfer: { maxTinybars: "1", recipients: ["0.0.7"] },
      }),
    );

    expect(policy.upgrade?.requireConfirmation).toBe(true);
    expect(policy.treasuryTransfer?.requireConfirmation).toBeUndefined();
  });

  it("refuses a value that is not true or false, which a string 'false' would read as on", () => {
    expect(() =>
      parsePolicy(policyOf({ tokenAdmin: { operations: ["pause"], tokens: [VAULT], requireConfirmation: "false" } })),
    ).toThrow(/must be true or false/);
  });
});

describe("the secret the confirmation codes come from", () => {
  const withSecret = <T>(value: string | undefined, read: () => T): T => {
    const previous = process.env.AGENT_TOTP_SECRET;
    if (value === undefined) delete process.env.AGENT_TOTP_SECRET;
    else process.env.AGENT_TOTP_SECRET = value;
    try {
      return read();
    } finally {
      if (previous === undefined) delete process.env.AGENT_TOTP_SECRET;
      else process.env.AGENT_TOTP_SECRET = previous;
    }
  };

  const escalating: Policy = { tokenAdmin: { operations: ["pause"], tokens: [VAULT], requireConfirmation: true } };
  const plain: Policy = { tokenAdmin: { operations: ["pause"], tokens: [VAULT] } };

  it("is read from the environment as the bytes of its base32", () => {
    expect(withSecret("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", () => confirmationSecret(escalating))).toHaveLength(20);
  });

  it("is nothing at all when no rule asks for a person", () => {
    expect(withSecret(undefined, () => confirmationSecret(plain))).toBeNull();
  });

  it("refuses to start a policy that escalates with no secret, since no code could release it", () => {
    expect(() => withSecret(undefined, () => confirmationSecret(escalating))).toThrow(/AGENT_TOTP_SECRET is unset/);
  });

  it("refuses a secret short enough to search, and an `A` decodes to no key at all", () => {
    expect(() => withSecret("A", () => confirmationSecret(escalating))).toThrow(/at least 16/);
    expect(() => withSecret("GEZDGNBVGY3TQOJQ", () => confirmationSecret(escalating))).toThrow(/10 bytes/);
  });

  it("refuses a secret that is not base32 rather than decoding a typo", () => {
    expect(() => withSecret("GEZD1GNBV", () => confirmationSecret(escalating))).toThrow(/not a base32 secret/);
  });
});

describe("the port the confirmation endpoint listens on", () => {
  const withPort = <T>(value: string | undefined, read: () => T): T => {
    const previous = process.env.AGENT_APPROVAL_PORT;
    if (value === undefined) delete process.env.AGENT_APPROVAL_PORT;
    else process.env.AGENT_APPROVAL_PORT = value;
    try {
      return read();
    } finally {
      if (previous === undefined) delete process.env.AGENT_APPROVAL_PORT;
      else process.env.AGENT_APPROVAL_PORT = previous;
    }
  };

  it("defaults rather than asking every deployment to choose one", () => {
    expect(withPort(undefined, approvalPort)).toBe(8787);
  });

  it("refuses anything that is not a port, rather than listening somewhere unexpected", () => {
    expect(() => withPort("0", approvalPort)).toThrow(/between 1 and 65535/);
    expect(() => withPort("70000", approvalPort)).toThrow(/between 1 and 65535/);
    expect(() => withPort("8787x", approvalPort)).toThrow(/between 1 and 65535/);
  });
});
