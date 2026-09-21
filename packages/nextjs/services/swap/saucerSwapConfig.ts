import type { SwapNetwork } from "./types";

export type SaucerSwapV2Config = {
  /** `SwapRouter` contract (`exactInputSingle`, `exactInput`). */
  swapRouter: string;
  /** `QuoterV2` contract: gas-free on-chain quotes. */
  quoterV2: string;
  /** WHBAR HTS token; the router wraps the HBAR sent as payable amount into it. */
  whbarToken: string;
  usdcToken: string;
  /** Pool fee tier used by default, in hundredths of a basis point (3000 = 0.30%). */
  defaultFee: number;
};

/**
 * Verified on testnet: the USDC/HBAR pool `0.0.9283328` (fee 0.30%) has liquidity and the
 * router settles `exactInputSingle` directly to the recipient.
 */
const TESTNET: SaucerSwapV2Config = {
  swapRouter: "0.0.1414040",
  quoterV2: "0.0.1390002",
  whbarToken: "0.0.15058",
  usdcToken: "0.0.5449",
  defaultFee: 3000,
};

/**
 * Ids from SaucerSwap's contract deployments page, checked against Mirror Node.
 * Not exercised by this template's tests or scripts.
 */
const MAINNET: SaucerSwapV2Config = {
  swapRouter: "0.0.3949434",
  quoterV2: "0.0.3949424",
  whbarToken: "0.0.1456986",
  usdcToken: "0.0.456858",
  defaultFee: 3000,
};

export const SAUCERSWAP_V2_CONFIG: Record<SwapNetwork, SaucerSwapV2Config> = {
  testnet: TESTNET,
  mainnet: MAINNET,
};
