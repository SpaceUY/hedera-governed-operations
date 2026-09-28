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
  explainer:
    "TokenAdmin holds this token's pause and freeze keys, so the council acts on the token through the registry: " +
    "the network refuses a scheduled TokenPause, and a scheduled call cannot present the treasury's key to the token service.",
  pauseStatus: (symbol: string, status: TokenPauseStatus) =>
    status === "NOT_APPLICABLE" ? `${symbol} has no pause key.` : `${symbol} is ${status.toLowerCase()} right now.`,
  freezeStatus: (accountId: string, symbol: string, status: TokenFreezeStatus) =>
    status === "NOT_APPLICABLE"
      ? `${symbol} has no freeze key, so ${accountId} cannot be frozen.`
      : `${accountId} is ${status.toLowerCase()} for ${symbol} right now.`,
  notAssociated: (accountId: string, symbol: string) =>
    `${accountId} is not associated with ${symbol}, so the network would refuse to freeze or unfreeze it ` +
    "(TOKEN_NOT_ASSOCIATED_TO_ACCOUNT) and the governance account would pay for the failed call.",
  relationshipUnreadable: (accountId: string) =>
    `Could not read how ${accountId} stands with the token right now. Try again.`,
  tokenUnreadable: (tokenId: string) => `Could not read token ${tokenId} on the Mirror Node right now.`,
  contractMissing:
    "TokenAdmin, the contract that holds the token's pause and freeze keys, is not deployed on this network. " +
    "Run `yarn hardhat:deploy --network hederaTestnet` to deploy it; paying a supplier works without it.",
} as const;
