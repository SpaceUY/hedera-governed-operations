import type { GovernedOperation } from "./operation";
import {
  type Policy,
  type TokenAdminRule,
  type TreasurySwapRule,
  type TreasuryTransferRule,
  type UpgradeRule,
  reviewOperation,
} from "./policy";
import { describe, expect, it } from "vitest";

const VAULT = "0x0000000000000000000000000000000000001234";
const IMPLEMENTATION = "0x0000000000000000000000000000000000005678";
const TOKEN = "0x000000000000000000000000000000000000abcd";
const TREASURY = "0.0.1001";
const SUPPLIER = "0.0.2002";

const upgrade = (overrides: Partial<Extract<GovernedOperation, { kind: "upgrade" }>> = {}): GovernedOperation => ({
  kind: "upgrade",
  target: VAULT,
  implementation: IMPLEMENTATION,
  hasInitializer: false,
  ...overrides,
});

const swap = (overrides: Partial<Extract<GovernedOperation, { kind: "treasurySwap" }>> = {}): GovernedOperation => ({
  kind: "treasurySwap",
  tokenOut: TOKEN,
  recipient: VAULT,
  amountInTinybars: 100_000_000n,
  payableTinybars: 100_000_000n,
  ...overrides,
});

const tokenAdmin = (
  overrides: Partial<Extract<GovernedOperation, { kind: "tokenAdmin" }>> = {},
): GovernedOperation => ({
  kind: "tokenAdmin",
  operation: "pause",
  token: TOKEN,
  account: null,
  ...overrides,
});

const transfer = (
  overrides: Partial<Extract<GovernedOperation, { kind: "treasuryTransfer" }>> = {},
): GovernedOperation => ({
  kind: "treasuryTransfer",
  hbar: [
    { accountId: TREASURY, tinybars: -100_000_000n },
    { accountId: SUPPLIER, tinybars: 100_000_000n },
  ],
  tokens: [],
  ...overrides,
});

const UPGRADE_RULE: UpgradeRule = { targets: [VAULT], implementations: [IMPLEMENTATION] };
const SWAP_RULE: TreasurySwapRule = { maxAmountInTinybars: 500_000_000n, tokensOut: [TOKEN], recipients: [VAULT] };
const TOKEN_ADMIN_RULE: TokenAdminRule = { operations: ["pause", "unpause"], tokens: [TOKEN] };
const TRANSFER_RULE: TreasuryTransferRule = { maxTinybars: 200_000_000n, recipients: [SUPPLIER] };

const FULL_POLICY: Policy = {
  upgrade: UPGRADE_RULE,
  treasurySwap: SWAP_RULE,
  tokenAdmin: TOKEN_ADMIN_RULE,
  treasuryTransfer: TRANSFER_RULE,
};

const refusal = (operation: GovernedOperation, policy: Policy = FULL_POLICY): string => {
  const verdict = reviewOperation(operation, policy);
  if (verdict.approved) throw new Error("expected a refusal, the operation was approved");
  return verdict.reason;
};

describe("a policy with no rule for a kind", () => {
  it("refuses every kind, rather than allowing what it does not mention", () => {
    const empty: Policy = {};
    for (const operation of [upgrade(), swap(), tokenAdmin(), transfer()]) {
      expect(reviewOperation(operation, empty).approved).toBe(false);
    }
  });

  it("names the kind it has no rule for", () => {
    expect(refusal(swap(), { upgrade: UPGRADE_RULE })).toContain("no treasury swaps");
  });

  it("does not let a rule for one kind authorise another", () => {
    expect(reviewOperation(upgrade(), { treasurySwap: SWAP_RULE }).approved).toBe(false);
  });
});

describe("a council rotation", () => {
  it("is refused whatever the policy says, because no rule can be written for it", () => {
    expect(refusal({ kind: "councilRotation" })).toContain("never signed automatically");
  });
});

describe("an upgrade", () => {
  it("is approved when the proxy and the implementation are both listed", () => {
    expect(reviewOperation(upgrade(), FULL_POLICY).approved).toBe(true);
  });

  it("is refused for a contract the agent does not upgrade", () => {
    expect(refusal(upgrade({ target: "0x000000000000000000000000000000000000dead" }))).toContain("not a contract");
  });

  it("is refused for an implementation outside the allowlist", () => {
    expect(refusal(upgrade({ implementation: "0x000000000000000000000000000000000000beef" }))).toContain(
      "not in the allowlist",
    );
  });

  it("is refused when it carries an initializer, which the allowlist says nothing about", () => {
    expect(refusal(upgrade({ hasInitializer: true }))).toContain("initializer");
  });

  it("is approved with an initializer only when the rule opts in", () => {
    const policy: Policy = { upgrade: { ...UPGRADE_RULE, allowInitializer: true } };
    expect(reviewOperation(upgrade({ hasInitializer: true }), policy).approved).toBe(true);
  });

  it("matches an address whatever its casing, since a decoder checksums and a human types", () => {
    const policy: Policy = {
      upgrade: { targets: [VAULT.toUpperCase().replace("0X", "0x")], implementations: [IMPLEMENTATION] },
    };
    expect(reviewOperation(upgrade(), policy).approved).toBe(true);
  });
});

describe("a treasury swap", () => {
  it("is approved inside every limit", () => {
    expect(reviewOperation(swap(), FULL_POLICY).approved).toBe(true);
  });

  it("is refused when the amount in the call and the HBAR attached to it disagree", () => {
    // The limit would pass on either number alone; what is refused is that they are not the same
    // number, because then the proposal does something other than it reads.
    const reason = refusal(swap({ amountInTinybars: 100_000_000n, payableTinybars: 400_000_000n }));
    expect(reason).toContain("but the proposal sends");
  });

  it("is refused over the ceiling", () => {
    expect(refusal(swap({ amountInTinybars: 900_000_000n, payableTinybars: 900_000_000n }))).toContain("over the");
  });

  it("caps on the HBAR that actually leaves the treasury", () => {
    const reason = refusal(swap({ amountInTinybars: 600_000_000n, payableTinybars: 600_000_000n }));
    expect(reason).toContain("6 ℏ");
  });

  it("is refused for a token it does not buy", () => {
    expect(refusal(swap({ tokenOut: "0x000000000000000000000000000000000000ffff" }))).toContain("not a token");
  });

  it("is refused when the proceeds go somewhere else", () => {
    expect(refusal(swap({ recipient: "0x000000000000000000000000000000000000ffff" }))).toContain("not a recipient");
  });
});

describe("token administration", () => {
  it("is approved for a listed operation on a listed token", () => {
    expect(reviewOperation(tokenAdmin(), FULL_POLICY).approved).toBe(true);
  });

  it("is refused for an operation the policy leaves out", () => {
    expect(refusal(tokenAdmin({ operation: "freeze", account: "0.0.3003" }))).toContain("not an operation");
  });

  it("is refused for another token", () => {
    expect(refusal(tokenAdmin({ token: "0x000000000000000000000000000000000000ffff" }))).toContain("not a token");
  });
});

describe("a treasury transfer", () => {
  it("is approved inside the ceiling and to a listed recipient", () => {
    expect(reviewOperation(transfer(), FULL_POLICY).approved).toBe(true);
  });

  it("is refused over the ceiling", () => {
    const over = transfer({
      hbar: [
        { accountId: TREASURY, tinybars: -300_000_000n },
        { accountId: SUPPLIER, tinybars: 300_000_000n },
      ],
    });
    expect(refusal(over)).toContain("over the");
  });

  it("totals every credit rather than checking them one by one", () => {
    const split = transfer({
      hbar: [
        { accountId: TREASURY, tinybars: -300_000_000n },
        { accountId: SUPPLIER, tinybars: 150_000_000n },
        { accountId: SUPPLIER, tinybars: 150_000_000n },
      ],
    });
    expect(refusal(split)).toContain("over the");
  });

  it("is refused when any credit goes to an account the policy does not name", () => {
    const stranger = transfer({
      hbar: [
        { accountId: TREASURY, tinybars: -100_000_000n },
        { accountId: SUPPLIER, tinybars: 50_000_000n },
        { accountId: "0.0.9999", tinybars: 50_000_000n },
      ],
    });
    expect(refusal(stranger)).toContain("0.0.9999");
  });

  it("refuses a token transfer when the rule names no tokens, since a tinybar ceiling cannot price one", () => {
    const withToken = transfer({ tokens: [{ tokenId: "0.0.4004", accountId: SUPPLIER, amount: 5n }] });
    expect(refusal(withToken)).toContain("not one this agent transfers");
  });

  it("allows a listed token to a listed recipient", () => {
    const policy: Policy = { treasuryTransfer: { ...TRANSFER_RULE, tokens: ["0.0.4004"] } };
    const withToken = transfer({ tokens: [{ tokenId: "0.0.4004", accountId: SUPPLIER, amount: 5n }] });
    expect(reviewOperation(withToken, policy).approved).toBe(true);
  });

  it("refuses a listed token sent to an account the policy does not name", () => {
    const policy: Policy = { treasuryTransfer: { ...TRANSFER_RULE, tokens: ["0.0.4004"] } };
    const withToken = transfer({ tokens: [{ tokenId: "0.0.4004", accountId: "0.0.9999", amount: 5n }] });
    const verdict = reviewOperation(withToken, policy);
    expect(verdict.approved).toBe(false);
  });

  it("ignores the debited side, which is the treasury paying", () => {
    expect(reviewOperation(transfer(), FULL_POLICY).approved).toBe(true);
  });
});

describe("a rule that asks for a person as well as its limits", () => {
  it("approves an operation inside the limits and says a confirmation is still needed", () => {
    const rule: UpgradeRule = { targets: [VAULT], implementations: [IMPLEMENTATION], requireConfirmation: true };

    expect(reviewOperation(upgrade(), { upgrade: rule })).toEqual({ approved: true, requiresConfirmation: true });
  });

  it("refuses an operation outside them without asking anybody, since the answer is already no", () => {
    const rule: UpgradeRule = { targets: [VAULT], implementations: [IMPLEMENTATION], requireConfirmation: true };

    expect(reviewOperation(upgrade({ target: TOKEN }), { upgrade: rule })).toMatchObject({ approved: false });
  });

  it("leaves the signature to the agent when the rule says nothing, which is the default", () => {
    const rule: UpgradeRule = { targets: [VAULT], implementations: [IMPLEMENTATION] };

    expect(reviewOperation(upgrade(), { upgrade: rule })).toEqual({ approved: true, requiresConfirmation: false });
  });

  it("is a decision per rule, so a transfer can be signed while an upgrade waits", () => {
    const policy: Policy = {
      upgrade: { targets: [VAULT], implementations: [IMPLEMENTATION], requireConfirmation: true },
      treasuryTransfer: { maxTinybars: 100_000_000n, recipients: [TREASURY] },
    };
    const transfer: GovernedOperation = {
      kind: "treasuryTransfer",
      hbar: [{ accountId: TREASURY, tinybars: 1_000n }],
      tokens: [],
    };

    expect(reviewOperation(upgrade(), policy)).toMatchObject({ requiresConfirmation: true });
    expect(reviewOperation(transfer, policy)).toMatchObject({ requiresConfirmation: false });
  });
});
