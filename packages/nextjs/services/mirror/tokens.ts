import { type MirrorPage, type MirrorRequestOptions, assertValidEntityId, mirrorRequest } from "./client";
import type { MirrorKey } from "./schedules";

/** "NOT_APPLICABLE" when the token has no pause key, so pausing it is not an option at all. */
export type TokenPauseStatus = "PAUSED" | "UNPAUSED" | "NOT_APPLICABLE";

/** "NOT_APPLICABLE" when the token has no freeze key. */
export type TokenFreezeStatus = "FROZEN" | "UNFROZEN" | "NOT_APPLICABLE";

export type TokenKycStatus = "GRANTED" | "REVOKED" | "NOT_APPLICABLE";

/**
 * Token entity from GET /api/v1/tokens/{id} (subset).
 *
 * Amounts and `decimals` arrive as strings on this endpoint but as numbers on the
 * account relationship below; run either through `parseTokenDecimals` before doing math.
 */
export type MirrorToken = {
  token_id: string;
  name: string;
  symbol: string;
  decimals: string;
  total_supply: string;
  max_supply: string;
  supply_type: "FINITE" | "INFINITE";
  type: "FUNGIBLE_COMMON" | "NON_FUNGIBLE_UNIQUE";
  treasury_account_id: string;
  memo: string;
  deleted: boolean;
  pause_status: TokenPauseStatus;
  /** Whether an account starts out frozen when it associates the token. */
  freeze_default: boolean;
  admin_key: MirrorKey | null;
  freeze_key: MirrorKey | null;
  pause_key: MirrorKey | null;
  supply_key: MirrorKey | null;
  wipe_key: MirrorKey | null;
};

/** One row of GET /api/v1/accounts/{id}/tokens: how a single account stands with a single token. */
export type MirrorTokenRelationship = {
  token_id: string;
  balance: number;
  decimals: number;
  /** Per-account state; the token-wide `pause_status` says nothing about it. */
  freeze_status: TokenFreezeStatus;
  kyc_status: TokenKycStatus;
  automatic_association: boolean;
  created_timestamp: string;
};

export type MirrorTokenRelationshipsResponse = MirrorPage & {
  tokens: MirrorTokenRelationship[];
};

/** Normalizes the two shapes Mirror uses for `decimals` into a usable exponent. */
export function parseTokenDecimals(decimals: string | number): number {
  const parsed = Number(decimals);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid token decimals: expected a whole count, got ${decimals}`);
  }
  return parsed;
}

export async function fetchToken(tokenId: string, options: MirrorRequestOptions = {}): Promise<MirrorToken> {
  assertValidEntityId(tokenId, "token ID");
  return mirrorRequest<MirrorToken>(`/api/v1/tokens/${tokenId}`, options);
}

/**
 * Reads how one account stands with one token, for the freeze/unfreeze proposals.
 * Mirror answers with an empty list rather than a 404 when the account never
 * associated the token, which this returns as `null`.
 */
export async function fetchTokenRelationship(
  accountId: string,
  tokenId: string,
  options: MirrorRequestOptions = {},
): Promise<MirrorTokenRelationship | null> {
  assertValidEntityId(accountId, "account ID");
  assertValidEntityId(tokenId, "token ID");
  const page = await mirrorRequest<MirrorTokenRelationshipsResponse>(
    `/api/v1/accounts/${accountId}/tokens?token.id=${tokenId}`,
    options,
  );
  return page.tokens?.[0] ?? null;
}
