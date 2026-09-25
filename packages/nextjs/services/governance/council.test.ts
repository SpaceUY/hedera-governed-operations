import { fetchCouncilKey } from "./council";
import { afterEach, describe, expect, it, vi } from "vitest";
import governanceAccount from "~~/services/mirror/__fixtures__/account.json";

/** The three members of the fixture's 2-of-3 key, as Mirror writes them on a schedule's signatures. */
const MEMBER_KEYS = [
  "Axf0o26IIX71WariMWRAq8ZRpK85cmuZseQMZJtvqc8W",
  "A8ZOXqRHjGJ59xH6h3Zh96PaVXzEHtJA/DtxSFHTmFO7",
  "Ax8MbYmp8RO1AM0RSYCMOv2/QHQ60UBTWwtbrbcwzPfs",
];

/** A key list with no threshold over the second and third members of the fixture. */
const KEY_LIST_WITHOUT_THRESHOLD =
  "324a0a233a2103c64e5ea4478c6279f711fa877661f7a3da557cc41ed240fc3b714851d39853bb0a233a21031f0c6d89a9f113b500cd1149808c3afdbf40743ad140535b0b5badb730ccf7ec";

/** A 1-of-1 threshold key whose only member is itself a key list. */
const NESTED_MEMBER = "2a2d080112290a2732250a233a2103c64e5ea4478c6279f711fa877661f7a3da557cc41ed240fc3b714851d39853bb";

function stubAccountKey(key: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...governanceAccount, key }))));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchCouncilKey", () => {
  it("reads how many signatures the council needs", async () => {
    stubAccountKey(governanceAccount.key);

    await expect(fetchCouncilKey("0.0.10590498", "testnet")).resolves.toMatchObject({ threshold: 2 });
  });

  it("returns the members in the encoding Mirror uses for a schedule's signatures", async () => {
    stubAccountKey(governanceAccount.key);

    const { memberKeys } = await fetchCouncilKey("0.0.10590498", "testnet");

    expect(memberKeys).toEqual(MEMBER_KEYS);
  });

  it("treats a key list with no threshold as needing every member", async () => {
    stubAccountKey({ _type: "ProtobufEncoded", key: KEY_LIST_WITHOUT_THRESHOLD });

    await expect(fetchCouncilKey("0.0.10590498", "testnet")).resolves.toMatchObject({ threshold: 2 });
  });

  it("refuses an account whose key is a single public key, since it has no council", async () => {
    stubAccountKey({
      _type: "ECDSA_SECP256K1",
      key: "03c64e5ea4478c6279f711fa877661f7a3da557cc41ed240fc3b714851d39853bb",
    });

    await expect(fetchCouncilKey("0.0.8192684", "testnet")).rejects.toThrow("0.0.8192684");
  });

  it("refuses a member that is not a single public key, since no signature could match it", async () => {
    stubAccountKey({ _type: "ProtobufEncoded", key: NESTED_MEMBER });

    await expect(fetchCouncilKey("0.0.10590498", "testnet")).rejects.toThrow("not a single public key");
  });
});
