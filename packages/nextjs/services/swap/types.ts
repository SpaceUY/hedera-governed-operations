import type { ContractExecuteTransaction } from "@hiero-ledger/sdk";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

export type HbarToken = { kind: "hbar" };
export type HtsToken = { kind: "hts"; tokenId: string };
export type SwapToken = HbarToken | HtsToken;

export const HBAR: HbarToken = { kind: "hbar" };

export const htsToken = (tokenId: string): HtsToken => ({ kind: "hts", tokenId });

export const isHbar = (token: SwapToken): token is HbarToken => token.kind === "hbar";

export type SwapNetwork = HederaNetworkName;

/** Amounts are in the smallest unit of each token (tinybar for HBAR). */
export type QuoteRequest = {
  tokenIn: SwapToken;
  tokenOut: SwapToken;
  amountIn: bigint;
};

export type SwapHop = {
  tokenIn: SwapToken;
  tokenOut: SwapToken;
  /** Pool fee tier in hundredths of a basis point (3000 = 0.30%). */
  fee: number;
};

export type SwapRoute = {
  dex: string;
  hops: readonly SwapHop[];
};

export type SwapQuote = {
  amountOut: bigint;
  amountOutMinimum: bigint;
  route: SwapRoute;
};

export type SwapStepRequest = QuoteRequest & {
  amountOutMinimum: bigint;
  /** Hedera account id (`0.0.x`) that receives `tokenOut` directly from the DEX. */
  recipient: string;
  /** Unix timestamp in seconds after which the DEX rejects the swap. */
  deadline: number;
};

/**
 * A DEX integration the app can quote against and build swap transactions with.
 * `buildSwapStep` returns a built, unfrozen, unsigned transaction so the caller decides
 * how it is signed and sent (wallet, operator, or as an inner transaction of a batch).
 */
export type SwapProvider = {
  quote(request: QuoteRequest): Promise<SwapQuote>;
  buildSwapStep(request: SwapStepRequest): Promise<ContractExecuteTransaction>;
};
