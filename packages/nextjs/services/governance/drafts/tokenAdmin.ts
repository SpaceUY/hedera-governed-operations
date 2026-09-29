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

/** `accountId` is the holder a freeze or unfreeze acts on, as the Mirror Node resolved it; null for pause and unpause. */
export type TokenAdminValues = { operation: TokenAdminOperation; accountId: string | null };

/** The token and the holder are named by their long-zero addresses, the form the token system contract takes. */
export function draftTokenAdmin(targets: TokenAdminTargets, values: TokenAdminValues): ProposalDraft {
  return {
    path: "registry",
    kind: "tokenAdmin",
    target: `Token admin · ${targets.tokenAdminContractId}`,
    proposal: encodeTokenAdmin({
      tokenAdmin: targets.tokenAdmin,
      operation: values.operation,
      token: longZeroAddress(targets.tokenId),
      account: values.accountId ? longZeroAddress(values.accountId) : undefined,
    }),
  };
}
