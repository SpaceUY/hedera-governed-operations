import type { ProposalDraft } from "./draft";
import { encodeTokenAdmin } from "@sh/core/governance/encode";
import type { TokenAdminOperation } from "@sh/core/governance/proposalTypes";
import { longZeroAddress } from "@sh/core/identity";
import type { Address } from "viem";

export type TokenAdminTargets = {
  /** `TokenAdmin`, which holds the token's pause and freeze keys. */
  tokenAdmin: Address;
  tokenAdminContractId: string;
  /** The token whose keys `TokenAdmin` holds. */
  tokenId: string;
};

/**
 * `holder` is the account a freeze or unfreeze acts on, as the address the Mirror Node reports for it
 * (`evm_address`); null for pause and unpause.
 */
export type TokenAdminValues = { operation: TokenAdminOperation; holder: string | null };

/**
 * The token is named by its long-zero address. The holder is named by the address the network knows it
 * by — its alias when it has one — because the token system contract refuses the long-zero address of
 * an aliased account as `INVALID_ACCOUNT_ID` (15), measured on testnet.
 */
export function draftTokenAdmin(targets: TokenAdminTargets, values: TokenAdminValues): ProposalDraft {
  return {
    path: "registry",
    kind: "tokenAdmin",
    target: `Token admin · ${targets.tokenAdminContractId}`,
    proposal: encodeTokenAdmin({
      tokenAdmin: targets.tokenAdmin,
      operation: values.operation,
      token: longZeroAddress(targets.tokenId),
      account: values.holder ? (values.holder as Address) : undefined,
    }),
  };
}
