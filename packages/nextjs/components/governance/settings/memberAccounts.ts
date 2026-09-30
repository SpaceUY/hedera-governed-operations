/**
 * The accounts a council change seats that hold no seat yet: each typed account's own key, read from
 * the Mirror Node, as the seat `CouncilKey.memberKeys` writes it, so it joins the seats the composer
 * offers. Whether the council it makes can approve anything stays the encoder's call.
 */
import { SETTINGS_COPY } from "./copy";
import { memberKeyOfAccount } from "@sh/core/governance/council";
import { accountLookup } from "~~/components/governance/wizard/kinds/accountLookup";
import type { AccountListRead } from "~~/hooks/mirror/useAccounts";

/** One row: its seat, a seat already offered (said, and adding nothing), not known yet, or why it cannot be one. */
export type MemberSeat =
  | { status: "found"; accountId: string; seat: string }
  | { status: "offered"; message: string }
  | { status: "empty" }
  | { status: "invalid"; message: string };

/** `settled` once no row is still empty, looking, or refused: until then the change leaves the rows out. */
export type MemberKeys = { rows: MemberSeat[]; memberKeys: string[]; settled: boolean };

function memberSeatOf(input: string, read: AccountListRead | undefined, offered: readonly string[]): MemberSeat {
  const lookup = accountLookup(input, { accountId: read?.account?.account, error: read?.error ?? null });
  if (lookup.status !== "found") return lookup;

  const accountKey = read?.account?.key ?? null;
  const seat = memberKeyOfAccount(accountKey);
  if (!seat) {
    const keyType = accountKey?._type ?? "missing";
    return { status: "invalid", message: SETTINGS_COPY.composer.members.notSingleKey(lookup.accountId, keyType) };
  }
  if (offered.includes(seat)) {
    return { status: "offered", message: SETTINGS_COPY.composer.members.alreadyOffered(lookup.accountId) };
  }
  return { status: "found", accountId: lookup.accountId, seat };
}

/**
 * Each typed account's seat, in the order the rows are listed, after the seats already `offered`. A
 * member has to hold one key of its own: a key list or a threshold key is not a seat the council's
 * key can hold. An account typed twice is seated once.
 */
export function memberKeysOf(inputs: string[], reads: AccountListRead[], offered: readonly string[]): MemberKeys {
  const rows: MemberSeat[] = [];
  const memberKeys: string[] = [];
  for (const [index, input] of inputs.entries()) {
    const row = memberSeatOf(input, reads[index], [...offered, ...memberKeys]);
    if (row.status === "found") memberKeys.push(row.seat);
    rows.push(row);
  }
  const settled = rows.every(row => row.status === "found" || row.status === "offered");
  return { rows, memberKeys, settled };
}
