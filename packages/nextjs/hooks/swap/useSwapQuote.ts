"use client";

import { useQuery } from "@tanstack/react-query";
import { HBAR, type SwapQuote, createSwapProvider, htsToken } from "~~/services/swap";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

/**
 * A quote is the pool's price now, and the pool moves. It is re-read on this interval so the number
 * beside the floor is never older than the form has been open.
 */
export const SWAP_QUOTE_POLL_MS = 15_000;

export type SwapQuoteOptions = {
  network: HederaNetworkName;
  /** The HTS token the treasury buys, as a `0.0.x` id. */
  tokenOutId: string;
  /** What the treasury sells, in tinybars; null while the amount field is empty or malformed. */
  amountInTinybars: bigint | null;
};

/**
 * What SaucerSwap would pay for a given amount of treasury HBAR right now, read through `QuoterV2`
 * over the JSON-RPC relay. It informs the floor a proposer sets and never becomes it: the council
 * approves a limit that has to survive until the last signature lands, which this price will not.
 */
export function useSwapQuote({ network, tokenOutId, amountInTinybars }: SwapQuoteOptions) {
  const amountIn = amountInTinybars ?? 0n;

  return useQuery<SwapQuote, Error>({
    queryKey: ["swap-quote", network, tokenOutId, amountIn.toString()],
    queryFn: () => createSwapProvider(network).quote({ tokenIn: HBAR, tokenOut: htsToken(tokenOutId), amountIn }),
    enabled: amountIn > 0n && tokenOutId.length > 0,
    refetchInterval: SWAP_QUOTE_POLL_MS,
    retry: false,
  });
}
