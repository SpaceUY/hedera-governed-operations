import { SwapValidationError } from "./errors";
import type { SwapNetwork } from "./types";
import { isEvmAddress } from "@sh/core/identity";
import { fetchAccount } from "@sh/core/mirror";
import type { Address } from "viem";

/**
 * Maps a Hedera account id to the EVM address the network knows it by.
 * An account created from an ECDSA key has an alias address; HTS transfers to its
 * long-zero address (`0x…<account num>`) revert with `INVALID_ALIAS_KEY`, so the DEX
 * recipient must be resolved and not derived from the id.
 */
export type AccountResolver = {
  evmAddress(accountId: string): Promise<Address>;
};

export const createMirrorNodeAccountResolver = (network: SwapNetwork): AccountResolver => ({
  async evmAddress(accountId) {
    const { evm_address: evmAddress } = await fetchAccount(accountId, { network });
    if (!isEvmAddress(evmAddress)) {
      throw new SwapValidationError(`Mirror Node returned no EVM address for account ${accountId}`);
    }
    return evmAddress;
  },
});
