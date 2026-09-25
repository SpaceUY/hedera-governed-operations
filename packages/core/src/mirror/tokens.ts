import {
  type MirrorPage,
  type MirrorRequestOptions,
  assertMirrorEntityRef,
  isValidEntityId,
  mirrorRequest,
} from "./client";
import type { MirrorKey } from "./schedules";

/**
 * Upper bound this template's amount fields work with. It is not a network rule:
 * it keeps a malformed `decimals` from reaching `parseUnits` as a huge exponent.
 */
const MAX_TOKEN_DECIMALS = 18;

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

/**
 * Reads a `decimals` field, whichever of its two shapes Mirror used.
 *
 * Deliberately stricter than `Number`, which answers 0 for "", " ", null and [],
 * and reads "0x8" and "1e2" as numbers: the client does not validate the JSON it
 * parses, so a field Mirror left empty arrives here typed as a string. A wrong
 * exponent is invisible on a token with 0 decimals and silently misstates every
 * amount on one with 8.
 */
export function parseTokenDecimals(decimals: string | number): number {
  const count = toDecimalCount(decimals);
  if (!Number.isInteger(count) || count < 0 || count > MAX_TOKEN_DECIMALS) {
    throw new Error(`Invalid token decimals: expected a whole count up to ${MAX_TOKEN_DECIMALS}, got ${decimals}`);
  }
  return count;
}

function toDecimalCount(decimals: string | number): number {
  if (typeof decimals === "number") return decimals;
  if (typeof decimals === "string" && /^\d+$/.test(decimals.trim())) return Number(decimals.trim());
  return Number.NaN;
}

/** Accepts a `0.0.x` token id or a `0x…` EVM address; Mirror resolves either. */
export async function fetchToken(tokenId: string, options: MirrorRequestOptions = {}): Promise<MirrorToken> {
  const id = tokenId.trim();
  assertMirrorEntityRef(id, "token ID");
  return mirrorRequest<MirrorToken>(`/api/v1/tokens/${encodeURIComponent(id)}`, options);
}

/**
 * Reads how one account stands with one token, for the freeze and unfreeze proposals.
 * Either id may be a `0.0.x` id or an EVM address.
 *
 * `null` means there is no relationship to show. Mirror answers an account that never
 * associated the token with an empty list rather than a 404 — and answers an EVM address
 * that belongs to no account the same way, where a `0.0.x` id that does not exist gets a
 * 404. So a null here does not distinguish the two, and neither reading is a failure.
 */
export async function fetchTokenRelationship(
  accountId: string,
  tokenId: string,
  options: MirrorRequestOptions = {},
): Promise<MirrorTokenRelationship | null> {
  const account = accountId.trim();
  const token = tokenId.trim();
  assertMirrorEntityRef(account, "account ID");
  assertMirrorEntityRef(token, "token ID");

  const page = await mirrorRequest<MirrorTokenRelationshipsResponse>(
    `/api/v1/accounts/${encodeURIComponent(account)}/tokens?token.id=${encodeURIComponent(token)}`,
    options,
  );
  const row = page.tokens?.[0];
  if (!row) return null;
  // Rows come back filtered, but this is the read that decides whether a freeze changes
  // anything, so an answer about another token is discarded rather than shown. Only the
  // `0.0.x` form can be compared: the rows name the token that way whatever was asked.
  if (isValidEntityId(token) && row.token_id !== token) return null;
  return row;
}
