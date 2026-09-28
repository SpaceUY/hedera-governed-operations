import { COUNCIL_ROTATION_COPY } from "./copy";
import { memberKeysOf } from "./members";
import { PrivateKey } from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";
import { ACCOUNT_LOOKUP_LABELS } from "~~/components/governance/wizard/copy";
import type { AccountListRead } from "~~/hooks/mirror/useAccount";

const ed25519 = PrivateKey.generateED25519().publicKey;

const found = (account: string, key: { _type: string; key: string } | null): AccountListRead =>
  ({ account: { account, key }, error: null, isLoading: false }) as never;
const pending: AccountListRead = { account: undefined, error: null, isLoading: true };

describe("memberKeysOf", () => {
  it("reads one key per member, in the order the members are listed", () => {
    const members = memberKeysOf(["0.0.500"], [found("0.0.500", { _type: "ED25519", key: ed25519.toStringRaw() })]);

    if (members.status !== "found") throw new Error("expected keys");
    expect(members.memberKeys.map(key => key.toStringRaw())).toEqual([ed25519.toStringRaw()]);
  });

  it("waits while a member is still being looked up or has not been typed", () => {
    expect(memberKeysOf(["0.0.500"], [pending])).toEqual({ status: "empty" });
    expect(memberKeysOf([""], [pending])).toEqual({ status: "empty" });
  });

  it("says which member is not an account", () => {
    expect(memberKeysOf(["alice"], [pending])).toEqual({
      status: "invalid",
      message: ACCOUNT_LOOKUP_LABELS.malformed("alice"),
    });
  });

  it("refuses an account whose key is not a single key, since it could not hold one seat", () => {
    expect(memberKeysOf(["0.0.600"], [found("0.0.600", { _type: "ProtobufEncoded", key: "0a05" })])).toEqual({
      status: "invalid",
      message: COUNCIL_ROTATION_COPY.notSingleKey("0.0.600", "ProtobufEncoded"),
    });
  });
});
