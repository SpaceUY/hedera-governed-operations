/** Why the swap cannot be offered here: the one contract it calls is not deployed. */
export const TREASURY_SWAP_COPY = {
  adapterMissing:
    "The swap adapter is not deployed on this network, so a treasury swap cannot be proposed yet. " +
    "Run `yarn hardhat:deploy --network hederaTestnet` to deploy it; the other operations work without it.",
} as const;

/**
 * The words the swap form uses. The floor gets a sentence of its own because it is the one input a
 * council actually votes on, and the reason it is a limit rather than a slippage tolerance is not
 * something a proposer can be expected to infer from the field.
 */
export const SWAP_FORM_LABELS = {
  amount: "HBAR to sell",
  floor: (symbol: string) => `Floor (${symbol})`,
  floorHint: "The least the treasury accepts. This is what the council approves, not the quote.",
  quote: (amount: string, symbol: string) => `SaucerSwap would pay ${amount} ${symbol} right now`,
  quoteLoading: "Asking SaucerSwap what that HBAR is worth…",
  quoteUnavailable: "No quote right now — the pool may have no liquidity for this size.",
  staleFloorNote:
    "The swap runs when the last signature lands, hours or days from now. The pool's price then is " +
    "nobody's to predict, which is why the floor is a limit order and not a tolerance around today's quote.",
  tokenUnreadable: (tokenId: string) =>
    `Could not read ${tokenId} on the Mirror Node, so the floor has no scale to be read in. Try again.`,
} as const;
