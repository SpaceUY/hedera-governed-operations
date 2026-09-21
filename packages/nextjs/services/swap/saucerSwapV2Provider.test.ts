import type { AccountResolver } from "./accountResolver";
import { SAUCERSWAP_V2_CONFIG } from "./saucerSwapConfig";
import { type SaucerSwapQuoter, SaucerSwapV2Provider } from "./saucerSwapV2Provider";
import { HBAR, type SwapStepRequest, htsToken } from "./types";
import { describe, expect, it, vi } from "vitest";

const config = SAUCERSWAP_V2_CONFIG.testnet;
const USDC = htsToken(config.usdcToken);
const WHBAR = htsToken(config.whbarToken);
const WHBAR_EVM = "0x0000000000000000000000000000000000003ad2";
const USDC_EVM = "0x0000000000000000000000000000000000001549";
const RECIPIENT = "0.0.1234";
const RECIPIENT_LONG_ZERO = "0x00000000000000000000000000000000000004d2";
const RECIPIENT_ALIAS = "0xf2b17e6774b48f1073a94b78791aaa02698d1620";
const ONE_HBAR = 100_000_000n;
const NOW = 1_700_000_000;
const DEADLINE = 1_800_000_000;
const EVM_WORD_HEX_LENGTH = 64;
const SELECTOR_HEX_LENGTH = 8;

/** `exactInputSingle` calldata for `swapRequest` below, encoded independently with ethers. */
const KNOWN_GOOD_CALLDATA =
  "414bf389" +
  "0000000000000000000000000000000000000000000000000000000000003ad2" +
  "0000000000000000000000000000000000000000000000000000000000001549" +
  "0000000000000000000000000000000000000000000000000000000000000bb8" +
  "00000000000000000000000000000000000000000000000000000000000004d2" +
  "000000000000000000000000000000000000000000000000000000006b49d200" +
  "0000000000000000000000000000000000000000000000000000000005f5e100" +
  "00000000000000000000000000000000000000000000000000000000001f318b" +
  "0000000000000000000000000000000000000000000000000000000000000000";

const swapRequest: SwapStepRequest = {
  tokenIn: HBAR,
  tokenOut: USDC,
  amountIn: ONE_HBAR,
  amountOutMinimum: 2_044_299n,
  recipient: RECIPIENT,
  deadline: DEADLINE,
};

const createQuoter = (amountOut = 2_054_572n): SaucerSwapQuoter => ({
  quoteExactInputSingle: vi.fn().mockResolvedValue(amountOut),
});

const createAccounts = (evmAddress = RECIPIENT_LONG_ZERO): AccountResolver => ({
  evmAddress: vi.fn().mockResolvedValue(evmAddress),
});

type Doubles = { quoter?: SaucerSwapQuoter; accounts?: AccountResolver; slippageBps?: number };

const createProvider = ({ quoter = createQuoter(), accounts = createAccounts(), slippageBps }: Doubles = {}) =>
  new SaucerSwapV2Provider({ config, quoter, accounts, slippageBps, now: () => NOW });

const toHex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");

const calldataWord = (bytes: Uint8Array, index: number) =>
  toHex(bytes).slice(
    SELECTOR_HEX_LENGTH + index * EVM_WORD_HEX_LENGTH,
    SELECTOR_HEX_LENGTH + (index + 1) * EVM_WORD_HEX_LENGTH,
  );

const RECIPIENT_WORD_INDEX = 3;

describe("SaucerSwapV2Provider.quote", () => {
  it("asks the quoter for WHBAR to USDC with the default fee", async () => {
    const quoter = createQuoter();
    await createProvider({ quoter }).quote({ tokenIn: HBAR, tokenOut: USDC, amountIn: ONE_HBAR });
    expect(quoter.quoteExactInputSingle).toHaveBeenCalledWith({
      tokenIn: WHBAR_EVM,
      tokenOut: USDC_EVM,
      amountIn: ONE_HBAR,
      fee: 3000,
      sqrtPriceLimitX96: 0n,
    });
  });

  it("returns the quoted amount out", async () => {
    const quote = await createProvider({ quoter: createQuoter(2_054_572n) }).quote({
      tokenIn: HBAR,
      tokenOut: USDC,
      amountIn: ONE_HBAR,
    });
    expect(quote.amountOut).toBe(2_054_572n);
  });

  it("applies the default slippage to the minimum", async () => {
    const quote = await createProvider({ quoter: createQuoter(1_000_000n) }).quote({
      tokenIn: HBAR,
      tokenOut: USDC,
      amountIn: ONE_HBAR,
    });
    expect(quote.amountOutMinimum).toBe(995_000n);
  });

  it("applies a custom slippage to the minimum", async () => {
    const quote = await createProvider({ quoter: createQuoter(1_000_000n), slippageBps: 100 }).quote({
      tokenIn: HBAR,
      tokenOut: USDC,
      amountIn: ONE_HBAR,
    });
    expect(quote.amountOutMinimum).toBe(990_000n);
  });

  it("describes a single-hop route", async () => {
    const quote = await createProvider().quote({ tokenIn: HBAR, tokenOut: USDC, amountIn: ONE_HBAR });
    expect(quote.route).toEqual({ dex: "saucerswap-v2", hops: [{ tokenIn: HBAR, tokenOut: USDC, fee: 3000 }] });
  });

  it("rejects a zero amount in", async () => {
    await expect(createProvider().quote({ tokenIn: HBAR, tokenOut: USDC, amountIn: 0n })).rejects.toThrow(
      "amountIn must be positive",
    );
  });

  it("rejects identical tokens", async () => {
    await expect(createProvider().quote({ tokenIn: USDC, tokenOut: USDC, amountIn: 1n })).rejects.toThrow(
      "must differ",
    );
  });

  it("rejects HBAR as token out", async () => {
    await expect(createProvider().quote({ tokenIn: USDC, tokenOut: HBAR, amountIn: 1n })).rejects.toThrow(
      "tokenIn only",
    );
  });

  it("rejects a malformed token id", async () => {
    await expect(createProvider().quote({ tokenIn: HBAR, tokenOut: htsToken("usdc"), amountIn: 1n })).rejects.toThrow(
      "Hedera id",
    );
  });

  it("rejects a slippage above 10000 bps", () => {
    expect(() => createProvider({ slippageBps: 10_001 })).toThrow("basis points");
  });
});

describe("SaucerSwapV2Provider.buildSwapStep", () => {
  it("encodes exactInputSingle like the reference encoder", async () => {
    const tx = await createProvider().buildSwapStep(swapRequest);
    expect(toHex(tx.functionParameters ?? new Uint8Array())).toBe(KNOWN_GOOD_CALLDATA);
  });

  it("resolves the recipient through the account resolver", async () => {
    const accounts = createAccounts();
    await createProvider({ accounts }).buildSwapStep(swapRequest);
    expect(accounts.evmAddress).toHaveBeenCalledWith(RECIPIENT);
  });

  it("uses the resolved EVM alias as recipient", async () => {
    const tx = await createProvider({ accounts: createAccounts(RECIPIENT_ALIAS) }).buildSwapStep(swapRequest);
    expect(calldataWord(tx.functionParameters ?? new Uint8Array(), RECIPIENT_WORD_INDEX)).toBe(
      RECIPIENT_ALIAS.slice(2).padStart(EVM_WORD_HEX_LENGTH, "0"),
    );
  });

  it("targets the swap router", async () => {
    const tx = await createProvider().buildSwapStep(swapRequest);
    expect(tx.contractId?.toString()).toBe(config.swapRouter);
  });

  it("sets the payable amount to amountIn when HBAR is the token in", async () => {
    const tx = await createProvider().buildSwapStep(swapRequest);
    expect(tx.payableAmount?.toTinybars().toString()).toBe("100000000");
  });

  it("sets no payable amount when an HTS token is the token in", async () => {
    const tx = await createProvider().buildSwapStep({ ...swapRequest, tokenIn: USDC, tokenOut: WHBAR });
    expect(tx.payableAmount).toBeNull();
  });

  it("sets a gas limit", async () => {
    const tx = await createProvider().buildSwapStep(swapRequest);
    expect(tx.gas?.toNumber()).toBeGreaterThan(0);
  });

  it("returns an unfrozen transaction", async () => {
    const tx = await createProvider().buildSwapStep(swapRequest);
    expect(tx.isFrozen()).toBe(false);
  });

  it("rejects a zero minimum amount out", async () => {
    await expect(createProvider().buildSwapStep({ ...swapRequest, amountOutMinimum: 0n })).rejects.toThrow(
      "amountOutMinimum must be positive",
    );
  });

  it("rejects a malformed recipient", async () => {
    await expect(createProvider().buildSwapStep({ ...swapRequest, recipient: "0xabc" })).rejects.toThrow("recipient");
  });

  it("rejects a deadline in the past", async () => {
    await expect(createProvider().buildSwapStep({ ...swapRequest, deadline: NOW - 1 })).rejects.toThrow("deadline");
  });

  it("rejects a deadline equal to now", async () => {
    await expect(createProvider().buildSwapStep({ ...swapRequest, deadline: NOW })).rejects.toThrow("deadline");
  });

  it("accepts a deadline one second ahead", async () => {
    await expect(createProvider().buildSwapStep({ ...swapRequest, deadline: NOW + 1 })).resolves.toBeDefined();
  });

  it("rejects a fractional deadline", async () => {
    await expect(createProvider().buildSwapStep({ ...swapRequest, deadline: NOW + 1.5 })).rejects.toThrow("deadline");
  });
});
