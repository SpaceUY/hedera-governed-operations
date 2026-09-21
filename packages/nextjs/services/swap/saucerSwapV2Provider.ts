import type { AccountResolver } from "./accountResolver";
import type { SaucerSwapV2Config } from "./saucerSwapConfig";
import { SAUCERSWAP_V2_ROUTER_ABI } from "./saucerSwapV2Abi";
import { applySlippage, assertBasisPoints } from "./slippage";
import {
  type QuoteRequest,
  type SwapProvider,
  type SwapQuote,
  type SwapStepRequest,
  type SwapToken,
  isHbar,
} from "./types";
import { validateQuoteRequest, validateSwapStepRequest } from "./validation";
import { ContractExecuteTransaction, ContractId, Hbar, TokenId } from "@hiero-ledger/sdk";
import { type Address, encodeFunctionData, hexToBytes } from "viem";

export const SAUCERSWAP_V2_DEX = "saucerswap-v2";
export const DEFAULT_SLIPPAGE_BPS = 50;
/** An `exactInputSingle` HBAR to USDC swap used ~100k gas on testnet; this leaves headroom. */
export const DEFAULT_SWAP_GAS_LIMIT = 600_000;
/** Zero disables the price limit; slippage protection comes from `amountOutMinimum`. */
const NO_SQRT_PRICE_LIMIT = 0n;

export type QuoteExactInputSingleParams = {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  fee: number;
  sqrtPriceLimitX96: bigint;
};

/** The on-chain `QuoterV2.quoteExactInputSingle` read, injectable so tests never hit the network. */
export type SaucerSwapQuoter = {
  quoteExactInputSingle(params: QuoteExactInputSingleParams): Promise<bigint>;
};

export type SaucerSwapV2ProviderOptions = {
  config: SaucerSwapV2Config;
  quoter: SaucerSwapQuoter;
  accounts: AccountResolver;
  slippageBps?: number;
  gasLimit?: number;
  /** Current unix time in seconds; injectable for deterministic deadline checks. */
  now?: () => number;
};

const unixNow = (): number => Math.floor(Date.now() / 1000);

const tokenAddress = (tokenId: string): Address => `0x${TokenId.fromString(tokenId).toEvmAddress()}`;

export class SaucerSwapV2Provider implements SwapProvider {
  private readonly config: SaucerSwapV2Config;
  private readonly quoter: SaucerSwapQuoter;
  private readonly accounts: AccountResolver;
  private readonly slippageBps: number;
  private readonly gasLimit: number;
  private readonly now: () => number;

  constructor(options: SaucerSwapV2ProviderOptions) {
    const slippageBps = options.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
    assertBasisPoints(slippageBps);
    this.config = options.config;
    this.quoter = options.quoter;
    this.accounts = options.accounts;
    this.slippageBps = slippageBps;
    this.gasLimit = options.gasLimit ?? DEFAULT_SWAP_GAS_LIMIT;
    this.now = options.now ?? unixNow;
  }

  async quote(request: QuoteRequest): Promise<SwapQuote> {
    validateQuoteRequest(request);
    const fee = this.config.defaultFee;
    const amountOut = await this.quoter.quoteExactInputSingle({
      tokenIn: this.tokenAddress(request.tokenIn),
      tokenOut: this.tokenAddress(request.tokenOut),
      amountIn: request.amountIn,
      fee,
      sqrtPriceLimitX96: NO_SQRT_PRICE_LIMIT,
    });
    return {
      amountOut,
      amountOutMinimum: applySlippage(amountOut, this.slippageBps),
      route: { dex: SAUCERSWAP_V2_DEX, hops: [{ tokenIn: request.tokenIn, tokenOut: request.tokenOut, fee }] },
    };
  }

  async buildSwapStep(request: SwapStepRequest): Promise<ContractExecuteTransaction> {
    validateSwapStepRequest(request, this.now());
    const recipient = await this.accounts.evmAddress(request.recipient);
    const transaction = new ContractExecuteTransaction()
      .setContractId(ContractId.fromString(this.config.swapRouter))
      .setGas(this.gasLimit)
      .setFunctionParameters(hexToBytes(this.encodeExactInputSingle(request, recipient)));
    if (isHbar(request.tokenIn)) {
      transaction.setPayableAmount(Hbar.fromTinybars(request.amountIn.toString()));
    }
    return transaction;
  }

  private encodeExactInputSingle(request: SwapStepRequest, recipient: Address): `0x${string}` {
    return encodeFunctionData({
      abi: SAUCERSWAP_V2_ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: this.tokenAddress(request.tokenIn),
          tokenOut: this.tokenAddress(request.tokenOut),
          fee: this.config.defaultFee,
          recipient,
          deadline: BigInt(request.deadline),
          amountIn: request.amountIn,
          amountOutMinimum: request.amountOutMinimum,
          sqrtPriceLimitX96: NO_SQRT_PRICE_LIMIT,
        },
      ],
    });
  }

  /** The router and quoter only know WHBAR; HBAR sent as payable amount is wrapped by the router. */
  private tokenAddress(token: SwapToken): Address {
    return tokenAddress(isHbar(token) ? this.config.whbarToken : token.tokenId);
  }
}
