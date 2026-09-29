// @vitest-environment node

/**
 * The live SaucerSwap quote the swap form shows, against Hedera testnet. Opt-in on the same operator
 * the other integration suites need, so `yarn test` and CI stay offline — the quote itself is a public
 * `eth_call` and costs nothing.
 *
 * It reads and never writes: `QuoterV2.quoteExactInputSingle` simulates the swap and reverts
 * internally, which is why it goes through the relay rather than the SDK's `ContractCallQuery`.
 */
import { createSwapProvider } from "./createSwapProvider";
import { SAUCERSWAP_V2_CONFIG } from "./saucerSwapConfig";
import { HBAR, htsToken } from "./types";
import { describe, expect, it } from "vitest";

const NETWORK = "testnet";
const ONE_HBAR_IN_TINYBARS = 100_000_000n;
const STEP_TIMEOUT_MS = 60_000;

const hasOperator = Boolean(process.env.HEDERA_OPERATOR_ID && process.env.HEDERA_OPERATOR_PRIVATE_KEY);

describe.skipIf(!hasOperator)("SaucerSwapV2Provider against testnet", () => {
  it(
    "quotes one HBAR into the pool the template swaps through",
    async () => {
      const provider = createSwapProvider(NETWORK);

      const quote = await provider.quote({
        tokenIn: HBAR,
        tokenOut: htsToken(SAUCERSWAP_V2_CONFIG[NETWORK].usdcToken),
        amountIn: ONE_HBAR_IN_TINYBARS,
      });

      expect(quote.amountOut).toBeGreaterThan(0n);
      // The floor the provider suggests is the quote less slippage, so it is strictly the smaller one.
      expect(quote.amountOutMinimum).toBeLessThan(quote.amountOut);
      expect(quote.route.hops).toHaveLength(1);
    },
    STEP_TIMEOUT_MS,
  );
});
