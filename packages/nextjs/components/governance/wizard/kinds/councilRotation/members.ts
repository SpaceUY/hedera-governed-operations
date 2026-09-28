import { COUNCIL_ROTATION_COPY } from "./copy";
import type { PublicKey } from "@hiero-ledger/sdk";
import { singlePublicKey } from "@sh/core/governance/schedules";
import { accountLookup } from "~~/components/governance/wizard/kinds/accountLookup";
import type { AccountListRead } from "~~/hooks/mirror/useAccount";
import type { DraftResult } from "~~/services/governance/drafts";

export type MemberKeys = { status: "found"; memberKeys: PublicKey[] } | Exclude<DraftResult, { status: "ready" }>;

/**
 * The proposed members' keys, from what was typed and what the Mirror Node answered for each, or the
 * first row that is not a member yet and why. A member has to hold one key of its own: a key list or
 * a threshold key is not a seat the council's key can hold.
 */
export function memberKeysOf(inputs: string[], reads: AccountListRead[]): MemberKeys {
  const memberKeys: PublicKey[] = [];
  for (const [index, input] of inputs.entries()) {
    const read = reads[index];
    const lookup = accountLookup(input, { accountId: read?.account?.account, error: read?.error ?? null });
    if (lookup.status !== "found") return lookup;

    const key = singlePublicKey(read.account?.key ?? null);
    if (!key) {
      const keyType = read.account?.key?._type ?? "missing";
      return { status: "invalid", message: COUNCIL_ROTATION_COPY.notSingleKey(lookup.accountId, keyType) };
    }
    memberKeys.push(key);
  }
  return { status: "found", memberKeys };
}
