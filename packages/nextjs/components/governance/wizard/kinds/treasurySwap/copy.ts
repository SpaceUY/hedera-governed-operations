/**
 * The swap form frames slippage as a floor: the council approves a limit order that runs when the
 * threshold is reached, hours or days after today's quote.
 */
export const TREASURY_SWAP_COPY = {
  explainer:
    "Sell this much HBAR only if it yields at least the floor. The swap runs when the council reaches its threshold, " +
    "hours or days from now, so the floor is a limit and not a tolerance around today's price; the router refuses " +
    "the swap once the proposal has expired.",
  quoteLoading: "Asking the pool's quoter on chain…",
  quote: (amountOut: string, symbol: string) => `Right now the pool would pay ${amountOut} ${symbol} for this.`,
  quoteUnavailable: "Could not read a quote from the pool right now. The floor is still yours to set.",
  useQuote: (slippageBps: number) => `Set the floor ${slippageBps / 100}% under the quote`,
  floorAboveQuote:
    "This floor is above today's quote: unless the price improves by the time the threshold is reached, the swap " +
    "reverts, nothing is sold, and the entry stays pending for the council to schedule again or its proposer to cancel.",
  adapterMissing:
    "SaucerSwapAdapter, the only contract the registry sells treasury HBAR through, is not deployed on this network. " +
    "Run `yarn hardhat:deploy --network hederaTestnet` to deploy it; paying a supplier works without it.",
} as const;
