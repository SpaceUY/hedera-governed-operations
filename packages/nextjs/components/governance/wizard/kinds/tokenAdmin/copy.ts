import type { TokenAdminOperation } from "@sh/core/governance/proposalTypes";
import type { TokenFreezeStatus, TokenPauseStatus } from "@sh/core/mirror";

/** The token operations as the form offers them; the function names are what the preview shows. */
export const TOKEN_ADMIN_OPERATION_LABELS: Record<TokenAdminOperation, string> = {
  pause: "Pause",
  unpause: "Unpause",
  freeze: "Freeze an account",
  unfreeze: "Unfreeze an account",
};

/** What the token form says about the token and the holder, read from the Mirror Node. */
export const TOKEN_ADMIN_COPY = {
  // Why it has to be a contract call — a scheduled TokenPause is refused, and a schedule cannot
  // present the treasury's key to the token service — is in AGENTS.md's verified traps.
  explainer:
    "The token’s pause and freeze keys are the Token admin contract, so this is a contract call — it needs the council like everything else.",
  pauseStatus: (symbol: string, status: TokenPauseStatus) =>
    status === "NOT_APPLICABLE" ? `${symbol} has no pause key.` : `${symbol} is ${status.toLowerCase()} right now.`,
  freezeStatus: (accountId: string, symbol: string, status: TokenFreezeStatus) =>
    status === "NOT_APPLICABLE"
      ? `${symbol} has no freeze key, so ${accountId} cannot be frozen.`
      : `${accountId} is ${status.toLowerCase()} for ${symbol} right now.`,
  notAssociated: (accountId: string, symbol: string) =>
    `${accountId} is not associated with ${symbol}, so the network would refuse to freeze or unfreeze it ` +
    "(TOKEN_NOT_ASSOCIATED_TO_ACCOUNT) and the governance account would pay for the failed call.",
  noPauseKey: (symbol: string) =>
    `${symbol} has no pause key, so the network would refuse to pause or unpause it (TOKEN_HAS_NO_PAUSE_KEY) ` +
    "and the governance account would pay for the failed call.",
  pauseChangesNothing: (symbol: string, status: TokenPauseStatus) =>
    `${symbol} is ${status.toLowerCase()} already, so the council would approve a call that changes nothing ` +
    "and the governance account would pay for it.",
  noFreezeKey: (accountId: string, symbol: string) =>
    `${symbol} has no freeze key, so the network would refuse to freeze or unfreeze ${accountId} ` +
    "(TOKEN_HAS_NO_FREEZE_KEY) and the governance account would pay for the failed call.",
  relationshipUnreadable: (accountId: string) =>
    `Could not read how ${accountId} stands with the token right now. Try again.`,
  contractMissing:
    "TokenAdmin, the contract that holds the token's pause and freeze keys, is not deployed on this network. " +
    "Run `yarn hardhat:deploy --network hederaTestnet` to deploy it; paying a supplier works without it.",
} as const;
