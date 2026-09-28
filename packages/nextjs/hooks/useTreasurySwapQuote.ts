"use client";

import { useQuery } from "@tanstack/react-query";
import { HBAR, type SwapQuote, createSwapProvider, htsToken } from "~~/services/swap";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

/** A quote is a price at one moment, so it is re-read while the form is open rather than cached. */
export const SWAP_QUOTE_REFRESH_MS = 15_000;

export type TreasurySwapQuoteOptions = {
  network: HederaNetworkName;
  tokenOutId: string;
  /** Null while the form holds no amount that could be sold. */
  amountInTinybars: bigint | null;
};

/**
 * What the pool would pay for `amountInTinybars` of HBAR right now, read on chain through the relay
 * (`QuoterV2`), never from an API's reserves, which do not give a concentrated-liquidity price.
 */
export function useTreasurySwapQuote({ network, tokenOutId, amountInTinybars }: TreasurySwapQuoteOptions) {
  return useQuery<SwapQuote, Error>({
    queryKey: ["swap-quote", network, "hbar", tokenOutId, amountInTinybars?.toString() ?? ""],
    queryFn: () => {
      if (!amountInTinybars) throw new Error("There is no amount to quote");
      return createSwapProvider(network).quote({
        tokenIn: HBAR,
        tokenOut: htsToken(tokenOutId),
        amountIn: amountInTinybars,
      });
    },
    enabled: amountInTinybars !== null && amountInTinybars > 0n,
    refetchInterval: SWAP_QUOTE_REFRESH_MS,
    retry: false,
  });
}
