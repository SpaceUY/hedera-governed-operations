import type { SwapNetwork } from "./types";
import type { Address } from "viem";
import { mirrorGet } from "~~/services/mirrorNode";

/**
 * Maps a Hedera account id to the EVM address the network knows it by.
 * An account created from an ECDSA key has an alias address; HTS transfers to its
 * long-zero address (`0x…<account num>`) revert with `INVALID_ALIAS_KEY`, so the DEX
 * recipient must be resolved and not derived from the id.
 */
export type AccountResolver = {
  evmAddress(accountId: string): Promise<Address>;
};

type MirrorAccount = { evm_address: Address };

export const createMirrorNodeAccountResolver = (network: SwapNetwork): AccountResolver => ({
  async evmAddress(accountId) {
    const account = await mirrorGet<MirrorAccount>(`/api/v1/accounts/${accountId}`, network);
    return account.evm_address;
  },
});
