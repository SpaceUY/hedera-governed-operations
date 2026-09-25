import { SAUCERSWAP_V2_QUOTER_ABI } from "./saucerSwapV2Abi";
import type { SaucerSwapQuoter } from "./saucerSwapV2Provider";
import { ContractId } from "@hiero-ledger/sdk";
import { createRelayClient } from "@sh/core/relayClient";
import type { Address } from "viem";

export type JsonRpcQuoterOptions = {
  rpcUrl: string;
  quoterContractId: string;
};

/**
 * Reads `QuoterV2.quoteExactInputSingle` through `eth_call` on the Hedera JSON-RPC relay.
 * The function is not declared `view` (it simulates the swap and reverts internally), so it
 * goes through `simulateContract`; it still costs no gas and needs no operator key.
 */
export const createJsonRpcQuoter = (options: JsonRpcQuoterOptions): SaucerSwapQuoter => {
  const client = createRelayClient(options.rpcUrl);
  const address: Address = `0x${ContractId.fromString(options.quoterContractId).toEvmAddress()}`;
  return {
    async quoteExactInputSingle(params) {
      const {
        result: [amountOut],
      } = await client.simulateContract({
        address,
        abi: SAUCERSWAP_V2_QUOTER_ABI,
        functionName: "quoteExactInputSingle",
        args: [params],
      });
      return amountOut;
    },
  };
};
