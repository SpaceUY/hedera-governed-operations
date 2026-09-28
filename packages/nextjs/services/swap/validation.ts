import { SwapValidationError } from "./errors";
import { type QuoteRequest, type SwapStepRequest, type SwapToken, isHbar } from "./types";
import { isHederaAccountId } from "@sh/core/identity";

const sameToken = (left: SwapToken, right: SwapToken): boolean => {
  if (isHbar(left) || isHbar(right)) return isHbar(left) && isHbar(right);
  return left.tokenId === right.tokenId;
};

const assertTokenId = (token: SwapToken, label: string): void => {
  if (isHbar(token) || isHederaAccountId(token.tokenId)) return;
  throw new SwapValidationError(`${label} must be a Hedera id like 0.0.x, received "${token.tokenId}"`);
};

const assertPositive = (amount: bigint, label: string): void => {
  if (amount > 0n) return;
  throw new SwapValidationError(`${label} must be positive, received ${amount}`);
};

export const validateQuoteRequest = (request: QuoteRequest): void => {
  assertTokenId(request.tokenIn, "tokenIn");
  assertTokenId(request.tokenOut, "tokenOut");
  if (sameToken(request.tokenIn, request.tokenOut)) {
    throw new SwapValidationError("tokenIn and tokenOut must differ");
  }
  if (isHbar(request.tokenOut)) {
    throw new SwapValidationError("HBAR is supported as tokenIn only; use the WHBAR token as tokenOut");
  }
  assertPositive(request.amountIn, "amountIn");
};

export const validateSwapStepRequest = (request: SwapStepRequest, nowSeconds: number): void => {
  validateQuoteRequest(request);
  assertPositive(request.amountOutMinimum, "amountOutMinimum");
  if (!isHederaAccountId(request.recipient)) {
    throw new SwapValidationError(`recipient must be a Hedera account id like 0.0.x, received "${request.recipient}"`);
  }
  if (!Number.isInteger(request.deadline) || request.deadline <= nowSeconds) {
    throw new SwapValidationError(`deadline must be a unix timestamp in seconds later than now (${nowSeconds})`);
  }
};
