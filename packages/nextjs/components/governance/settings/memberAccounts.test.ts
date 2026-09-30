import { SETTINGS_COPY } from "./copy";
import { memberKeysOf } from "./memberAccounts";
import { PrivateKey } from "@hiero-ledger/sdk";
import { memberKeyOfAccount } from "@sh/core/governance/council";
import { describe, expect, it } from "vitest";
import { ACCOUNT_LOOKUP_LABELS } from "~~/components/governance/wizard/copy";
import type { AccountListRead } from "~~/hooks/mirror/useAccounts";

const ed25519 = { _type: "ED25519", key: PrivateKey.generateED25519().publicKey.toStringRaw() };
const ecdsa = { _type: "ECDSA_SECP256K1", key: PrivateKey.generateECDSA().publicKey.toStringRaw() };
const seat = (key: { _type: string; key: string }) => memberKeyOfAccount(key) ?? "";

const found = (account: string, key: { _type: string; key: string } | null): AccountListRead =>
  ({ account: { account, key }, error: null, isLoading: false }) as never;
const pending: AccountListRead = { account: undefined, error: null, isLoading: true };

describe("memberKeysOf", () => {
  it("reads one seat per account, in the order the rows are listed, as the council's key writes them", () => {
    const members = memberKeysOf(["0.0.500", "0.0.501"], [found("0.0.500", ed25519), found("0.0.501", ecdsa)], []);

    expect(members.memberKeys).toEqual([seat(ed25519), seat(ecdsa)]);
    expect(members.rows).toEqual([
      { status: "found", accountId: "0.0.500", seat: seat(ed25519) },
      { status: "found", accountId: "0.0.501", seat: seat(ecdsa) },
    ]);
    expect(members.settled).toBe(true);
  });

  it("waits while an account is still being looked up or has not been typed", () => {
    const members = memberKeysOf(["0.0.500", ""], [pending, pending], []);
    expect(members.rows).toEqual([{ status: "empty" }, { status: "empty" }]);
    expect(members.memberKeys).toEqual([]);
    expect(members.settled).toBe(false);
  });

  it("says which row is not an account", () => {
    expect(memberKeysOf(["alice"], [pending], []).rows).toEqual([
      { status: "invalid", message: ACCOUNT_LOOKUP_LABELS.malformed("alice") },
    ]);
  });

  it("refuses an account whose key is not a single key, since it could not hold one seat", () => {
    const members = memberKeysOf(["0.0.600"], [found("0.0.600", { _type: "ProtobufEncoded", key: "0a05" })], []);
    expect(members.rows).toEqual([
      { status: "invalid", message: SETTINGS_COPY.composer.members.notSingleKey("0.0.600", "ProtobufEncoded") },
    ]);
    expect(members.settled).toBe(false);
  });

  it("adds nothing for an account whose seat is already offered, and says so without holding the change back", () => {
    const members = memberKeysOf(["0.0.500"], [found("0.0.500", ed25519)], [seat(ed25519)]);
    expect(members.rows).toEqual([
      { status: "offered", message: SETTINGS_COPY.composer.members.alreadyOffered("0.0.500") },
    ]);
    expect(members.memberKeys).toEqual([]);
    expect(members.settled).toBe(true);
  });

  it("adds an account typed twice once: the second row says it is already offered", () => {
    const members = memberKeysOf(["0.0.500", "0.0.500"], [found("0.0.500", ed25519), found("0.0.500", ed25519)], []);
    expect(members.memberKeys).toEqual([seat(ed25519)]);
    expect(members.rows[1]).toEqual({
      status: "offered",
      message: SETTINGS_COPY.composer.members.alreadyOffered("0.0.500"),
    });
  });
});
