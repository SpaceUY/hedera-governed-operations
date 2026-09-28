/** What the transfer form says about the asset it moves and whether the recipient can hold it. */
export const TREASURY_TRANSFER_COPY = {
  hbarOption: "HBAR (ℏ)",
  amountLabel: (symbol: string) => `Amount (${symbol})`,
  notAssociated: (accountId: string, symbol: string) =>
    `${accountId} is not associated with ${symbol} and has no automatic association slots, so the network would ` +
    "refuse the transfer (TOKEN_NOT_ASSOCIATED_TO_ACCOUNT) once the council approved it.",
  associatesOnReceipt: (accountId: string, symbol: string) =>
    `${accountId} is not associated with ${symbol} yet. The transfer associates it automatically, provided one of ` +
    "its automatic association slots is still free when the threshold is reached.",
  relationshipUnreadable: (accountId: string) =>
    `Could not read whether ${accountId} can hold the token right now. Try again.`,
} as const;
