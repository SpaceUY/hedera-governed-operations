import { createMirrorNodeAccountResolver } from "./accountResolver";
import { createJsonRpcQuoter } from "./jsonRpcQuoter";
import { SAUCERSWAP_V2_CONFIG } from "./saucerSwapConfig";
import { SAUCERSWAP_V2_DEX, SaucerSwapV2Provider } from "./saucerSwapV2Provider";
import type { SwapNetwork, SwapProvider } from "./types";
import { getHederaRpcUrl } from "~~/utils/scaffold-hbar/networks";

export type SwapDex = typeof SAUCERSWAP_V2_DEX;

export const DEFAULT_SWAP_DEX: SwapDex = SAUCERSWAP_V2_DEX;

export type CreateSwapProviderOptions = {
  dex?: SwapDex;
  slippageBps?: number;
};

type ProviderFactory = (network: SwapNetwork, slippageBps?: number) => SwapProvider;

/** One entry per DEX; add a new integration by implementing `SwapProvider` and registering it here. */
const PROVIDER_FACTORIES: Record<SwapDex, ProviderFactory> = {
  [SAUCERSWAP_V2_DEX]: (network, slippageBps) => {
    const config = SAUCERSWAP_V2_CONFIG[network];
    const quoter = createJsonRpcQuoter({ rpcUrl: getHederaRpcUrl(network), quoterContractId: config.quoterV2 });
    const accounts = createMirrorNodeAccountResolver(network);
    return new SaucerSwapV2Provider({ config, quoter, accounts, slippageBps });
  },
};

export const createSwapProvider = (network: SwapNetwork, options: CreateSwapProviderOptions = {}): SwapProvider =>
  PROVIDER_FACTORIES[options.dex ?? DEFAULT_SWAP_DEX](network, options.slippageBps);
