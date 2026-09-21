import { SwapValidationError } from "./errors";

const BASIS_POINTS_DENOMINATOR = 10_000n;
const MAX_BASIS_POINTS = 10_000;

export const assertBasisPoints = (bps: number): void => {
  if (!Number.isInteger(bps) || bps < 0 || bps > MAX_BASIS_POINTS) {
    throw new SwapValidationError(`slippage must be an integer between 0 and ${MAX_BASIS_POINTS} basis points`);
  }
};

/** Minimum acceptable output for `amountOut` after `bps` of slippage, rounded down. */
export const applySlippage = (amountOut: bigint, bps: number): bigint => {
  assertBasisPoints(bps);
  return (amountOut * (BASIS_POINTS_DENOMINATOR - BigInt(bps))) / BASIS_POINTS_DENOMINATOR;
};
