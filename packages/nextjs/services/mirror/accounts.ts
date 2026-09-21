import { type MirrorRequestOptions, assertValidEntityId, mirrorRequest } from "./client";
import type { MirrorKey } from "./schedules";

export type MirrorTokenBalance = {
  token_id: string;
  balance: number;
};

/** Account entity from GET /api/v1/accounts/{id} (subset; `transactions` is not requested). */
export type MirrorAccount = {
  account: string;
  alias: string | null;
  evm_address: string | null;
  balance: {
    balance: number;
    timestamp: string;
    tokens: MirrorTokenBalance[];
  };
  key: MirrorKey | null;
  memo: string;
  deleted: boolean;
  created_timestamp: string;
  expiry_timestamp: string | null;
  auto_renew_period: number | null;
  max_automatic_token_associations: number;
  receiver_sig_required: boolean;
  ethereum_nonce: number;
};

/** Accepts a `0.0.x` account id or a `0x…` EVM address. */
export async function fetchAccount(accountId: string, options: MirrorRequestOptions = {}): Promise<MirrorAccount> {
  const id = accountId.trim();
  if (!id.startsWith("0x")) assertValidEntityId(id, "account ID");
  return mirrorRequest<MirrorAccount>(`/api/v1/accounts/${encodeURIComponent(id)}?transactions=false`, options);
}
