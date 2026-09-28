/**
 * What the agent is willing to sign, as one typed check per kind of operation.
 *
 * This is deliberately a map of checks and not a rule engine: five kinds, each with a handful of
 * limits, and a `switch` the compiler makes exhaustive when a sixth kind is added. If writing the
 * third policy had needed a condition this shape could not express, the answer would have been to
 * simplify the operation, not to grow a DSL here.
 *
 * Two properties matter more than the individual limits:
 *
 * **It fails closed.** A kind with no rule is refused, not allowed. An operator who writes a policy
 * covering swaps has not silently authorised upgrades, and a kind added to the domain later is
 * refused by every policy written before it existed rather than waved through.
 *
 * **A refusal carries its reason.** The agent holds a seat on a council, so "did not sign" is a
 * decision a human has to be able to audit; every branch below says which limit it was.
 */
import type { GovernedOperation } from "./operation";
import { Hbar } from "@hiero-ledger/sdk";
import type { TokenAdminOperation } from "@sh/core/governance/proposalTypes";

export type Verdict = { approved: true } | { approved: false; reason: string };

export type UpgradeRule = {
  /** Proxies the agent may upgrade, as EVM addresses. */
  targets: string[];
  /**
   * Implementations it may upgrade them to. An allowlist answers "is this address blessed" and
   * cannot answer "is the code at it still the build we blessed", which is why a policy may instead
   * — or also — name a release topic below. One of the two is required.
   */
  implementations?: string[];
  /**
   * HCS topic carrying release manifests. When set, an upgrade is only signed if the code deployed
   * at the proposed implementation hashes to what a release on that topic published for it. The
   * check needs the network, so it runs after this pure review rather than inside it.
   */
  manifestTopicId?: string;
  /**
   * Whether to sign an upgrade that also runs an initializer. Off by default because the two are not
   * the same operation: the initializer is arbitrary code nested inside what reads as a version bump,
   * and it is the part an allowlist of implementations says nothing about.
   */
  allowInitializer?: boolean;
};

export type TreasurySwapRule = {
  /** Ceiling on the HBAR actually leaving the treasury, per proposal. */
  maxAmountInTinybars: bigint;
  tokensOut: string[];
  recipients: string[];
};

export type TokenAdminRule = {
  operations: TokenAdminOperation[];
  tokens: string[];
};

export type TreasuryTransferRule = {
  /** Ceiling on the total HBAR credited by the proposal, per proposal. */
  maxTinybars: bigint;
  recipients: string[];
  /**
   * Token transfers are refused unless this names the tokens allowed out. A ceiling in tinybars says
   * nothing about a token amount, and reading what one is worth would take a price feed the agent
   * does not have.
   */
  tokens?: string[];
};

/**
 * A council rotation has no rule and cannot be given one: it is the operation that decides who
 * governs, including whether this agent keeps its seat, and nothing it could check would make an
 * automatic signature on it defensible. It is always refused, which the exhaustive switch below
 * makes visible rather than implicit.
 */
export type Policy = {
  upgrade?: UpgradeRule;
  treasurySwap?: TreasurySwapRule;
  tokenAdmin?: TokenAdminRule;
  treasuryTransfer?: TreasuryTransferRule;
};

const APPROVED: Verdict = { approved: true };

const refuse = (reason: string): Verdict => ({ approved: false, reason });

/** Addresses arrive EIP-55 checksummed from the decoder and are written by hand in the policy file. */
const listed = (allowlist: string[], value: string): boolean =>
  allowlist.some(entry => entry.toLowerCase() === value.toLowerCase());

const hbar = (tinybars: bigint): string => Hbar.fromTinybars(tinybars.toString()).toString();

function reviewUpgrade(operation: Extract<GovernedOperation, { kind: "upgrade" }>, rule: UpgradeRule): Verdict {
  if (!listed(rule.targets, operation.target))
    return refuse(`${operation.target} is not a contract this agent upgrades`);
  if (rule.implementations && !listed(rule.implementations, operation.implementation)) {
    return refuse(`implementation ${operation.implementation} is not in the allowlist`);
  }
  if (operation.hasInitializer && rule.allowInitializer !== true) {
    return refuse("the upgrade runs an initializer, which this policy does not allow");
  }
  return APPROVED;
}

function reviewTreasurySwap(
  operation: Extract<GovernedOperation, { kind: "treasurySwap" }>,
  rule: TreasurySwapRule,
): Verdict {
  // The amount in the calldata and the HBAR attached to the scheduled call are two separate numbers,
  // and only the second actually leaves the treasury. A proposal where they disagree does something
  // other than it reads, whichever way the difference goes, so it is refused before any limit.
  if (operation.amountInTinybars !== operation.payableTinybars) {
    return refuse(
      `the call asks to swap ${hbar(operation.amountInTinybars)} but the proposal sends ` +
        `${hbar(operation.payableTinybars)} with it`,
    );
  }
  if (operation.payableTinybars > rule.maxAmountInTinybars) {
    return refuse(`${hbar(operation.payableTinybars)} is over the ${hbar(rule.maxAmountInTinybars)} limit`);
  }
  if (!listed(rule.tokensOut, operation.tokenOut))
    return refuse(`${operation.tokenOut} is not a token this agent buys`);
  if (!listed(rule.recipients, operation.recipient)) {
    return refuse(`${operation.recipient} is not a recipient this agent pays out to`);
  }
  return APPROVED;
}

function reviewTokenAdmin(
  operation: Extract<GovernedOperation, { kind: "tokenAdmin" }>,
  rule: TokenAdminRule,
): Verdict {
  if (!rule.operations.includes(operation.operation)) {
    return refuse(`${operation.operation} is not an operation this agent approves`);
  }
  if (!listed(rule.tokens, operation.token)) return refuse(`${operation.token} is not a token this agent administers`);
  return APPROVED;
}

function reviewTreasuryTransfer(
  operation: Extract<GovernedOperation, { kind: "treasuryTransfer" }>,
  rule: TreasuryTransferRule,
): Verdict {
  const credited = operation.hbar.filter(transfer => transfer.tinybars > 0n);
  const total = credited.reduce((sum, transfer) => sum + transfer.tinybars, 0n);
  if (total > rule.maxTinybars) return refuse(`${hbar(total)} is over the ${hbar(rule.maxTinybars)} limit`);

  const unlisted = credited.find(transfer => !listed(rule.recipients, transfer.accountId));
  if (unlisted) return refuse(`${unlisted.accountId} is not a recipient this agent pays`);

  const tokens = rule.tokens ?? [];
  const unlistedToken = operation.tokens.filter(t => t.amount > 0n).find(t => !listed(tokens, t.tokenId));
  if (unlistedToken) return refuse(`token ${unlistedToken.tokenId} is not one this agent transfers`);

  const tokenToUnlisted = operation.tokens
    .filter(transfer => transfer.amount > 0n)
    .find(transfer => !listed(rule.recipients, transfer.accountId));
  if (tokenToUnlisted) return refuse(`${tokenToUnlisted.accountId} is not a recipient this agent pays`);

  return APPROVED;
}

export function reviewOperation(operation: GovernedOperation, policy: Policy): Verdict {
  switch (operation.kind) {
    case "upgrade":
      return policy.upgrade ? reviewUpgrade(operation, policy.upgrade) : refuse("this policy allows no upgrades");
    case "treasurySwap":
      return policy.treasurySwap
        ? reviewTreasurySwap(operation, policy.treasurySwap)
        : refuse("this policy allows no treasury swaps");
    case "tokenAdmin":
      return policy.tokenAdmin
        ? reviewTokenAdmin(operation, policy.tokenAdmin)
        : refuse("this policy allows no token administration");
    case "treasuryTransfer":
      return policy.treasuryTransfer
        ? reviewTreasuryTransfer(operation, policy.treasuryTransfer)
        : refuse("this policy allows no treasury transfers");
    case "councilRotation":
      return refuse("a council rotation is never signed automatically");
  }
}
