// @vitest-environment node
import type { MirrorSchedule } from "../mirror";
import governanceAccount from "../mirror/__fixtures__/account.json";
import executedSchedule from "../mirror/__fixtures__/schedule-executed.json";
import {
  type CouncilKey,
  councilHoldsKey,
  countThresholdSignatures,
  fetchCouncilKey,
  fetchCouncilKeyBefore,
  fetchProposerAccountIds,
  isSignedByKey,
  memberKeyOfAccount,
  memberPublicKey,
  memberSignedAt,
} from "./council";
import { PrivateKey } from "@hiero-ledger/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("fetchCouncilKeyBefore", () => {
  it("reads the governance account's key as it stood just before the timestamp", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(governanceAccount)));
    vi.stubGlobal("fetch", fetchMock);

    const council = await fetchCouncilKeyBefore("0.0.10590498", "1790721693.093999572", "testnet");

    expect(council).toEqual({ threshold: 2, memberKeys: MEMBER_KEYS });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/api/v1/accounts/0.0.10590498?transactions=false&timestamp=lt:1790721693.093999572",
    );
  });

  it("refuses an account that held a single key then, as fetchCouncilKey does now", async () => {
    stubAccountKey({
      _type: "ECDSA_SECP256K1",
      key: "03c64e5ea4478c6279f711fa877661f7a3da557cc41ed240fc3b714851d39853bb",
    });

    await expect(fetchCouncilKeyBefore("0.0.8192684", "1.0", "testnet")).rejects.toThrow("0.0.8192684");
  });

  it("asks nothing for an account id or a timestamp that is not one", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCouncilKeyBefore("0.0.1&limit=1", "1.0", "testnet")).rejects.toThrow();
    await expect(fetchCouncilKeyBefore("0.0.1", "1.0&order=asc", "testnet")).rejects.toThrow("timestamp");
    expect(fetchMock).not.toHaveBeenCalled();
  });
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

describe("memberKeyOfAccount and memberPublicKey", () => {
  it("round-trip an ECDSA and an ED25519 key through the seat form", () => {
    const ecdsa = PrivateKey.generateECDSA().publicKey;
    const ed25519 = PrivateKey.generateED25519().publicKey;
    const ecdsaSeat = memberKeyOfAccount({ _type: "ECDSA_SECP256K1", key: ecdsa.toStringRaw() });
    const ed25519Seat = memberKeyOfAccount({ _type: "ED25519", key: ed25519.toStringRaw() });

    expect(memberPublicKey(ecdsaSeat ?? "").toStringDer()).toBe(ecdsa.toStringDer());
    expect(memberPublicKey(ed25519Seat ?? "").toStringDer()).toBe(ed25519.toStringDer());
  });

  it("reads a seat of the fixture's council as the key Mirror would write for its account", () => {
    const [seat] = MEMBER_KEYS;
    const key = { _type: "ECDSA_SECP256K1", key: memberPublicKey(seat).toStringRaw() };
    expect(memberKeyOfAccount(key)).toBe(seat);
  });

  it("has no seat for a key that is not one public key", () => {
    expect(memberKeyOfAccount({ _type: "ProtobufEncoded", key: KEY_LIST_WITHOUT_THRESHOLD })).toBeNull();
    expect(memberKeyOfAccount(null)).toBeNull();
  });
});

describe("countThresholdSignatures", () => {
  const council: CouncilKey = { threshold: 2, memberKeys: MEMBER_KEYS };
  const [firstMember, secondMember] = MEMBER_KEYS;
  /** The account that paid to open every proposal in the fixtures, and holds no seat. */
  const PAYER = "AoSpRFf/h2qFC+yvgDbEhqRkgSZ5IJzANkz+2d4pqDIa";

  function scheduleSignedBy(...publicKeyPrefixes: string[]): MirrorSchedule {
    return {
      ...executedSchedule,
      signatures: publicKeyPrefixes.map(publicKeyPrefix => ({
        consensus_timestamp: executedSchedule.consensus_timestamp,
        public_key_prefix: publicKeyPrefix,
        signature: "",
        type: "ECDSA_SECP256K1",
      })),
    };
  }

  it("ignores the signature of a payer who holds no seat on the council", () => {
    expect(countThresholdSignatures(executedSchedule, council).signed).toBe(2);
  });

  it("counts the proposal's creator when the creator is also a member", () => {
    expect(countThresholdSignatures(scheduleSignedBy(secondMember), council).signed).toBe(1);
  });

  it("counts a member once however many signatures carry its key", () => {
    expect(countThresholdSignatures(scheduleSignedBy(secondMember, PAYER, secondMember), council).signed).toBe(1);
  });

  it("reports no progress when only non-members have signed", () => {
    expect(countThresholdSignatures(scheduleSignedBy(PAYER), council).signed).toBe(0);
  });

  it("matches a signature that carries only the first bytes of a member's key", () => {
    expect(countThresholdSignatures(scheduleSignedBy("A8ZO"), council).signedBy).toEqual([secondMember]);
  });

  it("lets no member be matched by an empty prefix", () => {
    expect(countThresholdSignatures(scheduleSignedBy(""), council).signed).toBe(0);
  });

  it("names the members who signed in the council's own order", () => {
    const progress = countThresholdSignatures(scheduleSignedBy(secondMember, firstMember), council);

    expect(progress.signedBy).toEqual([firstMember, secondMember]);
  });

  describe("isSignedByKey, the rule the count is built on", () => {
    /** The second member's key in hex, the form `PublicKey.toStringRaw` returns. */
    const secondMemberHex = Buffer.from(secondMember, "base64").toString("hex");

    it("recognises the key that signed", () => {
      expect(isSignedByKey(scheduleSignedBy(secondMember), secondMemberHex)).toBe(true);
    });

    it("recognises a signature carrying only the first bytes of that key", () => {
      expect(isSignedByKey(scheduleSignedBy("A8ZO"), secondMemberHex)).toBe(true);
    });

    it("does not recognise a key that signed nothing", () => {
      expect(isSignedByKey(scheduleSignedBy(PAYER), secondMemberHex)).toBe(false);
    });

    it("is not satisfied by an empty prefix", () => {
      expect(isSignedByKey(scheduleSignedBy(""), secondMemberHex)).toBe(false);
    });
  });

  describe("memberSignedAt", () => {
    const row = (publicKeyPrefix: string, consensusTimestamp: string) => ({
      consensus_timestamp: consensusTimestamp,
      public_key_prefix: publicKeyPrefix,
      signature: "",
      type: "ECDSA_SECP256K1",
    });

    it("answers with the earliest row that carries the member's key", () => {
      const schedule: MirrorSchedule = {
        ...executedSchedule,
        signatures: [
          row(PAYER, "1790000000.000000001"),
          row(secondMember, "1790000009.000000000"),
          row("A8ZO", "1790000005.000000002"),
        ],
      };

      expect(memberSignedAt(schedule, secondMember)).toBe("1790000005.000000002");
    });

    it("answers null for a member who never signed", () => {
      expect(memberSignedAt(scheduleSignedBy(PAYER), firstMember)).toBeNull();
    });
  });
});

describe("councilHoldsKey", () => {
  const council: CouncilKey = { threshold: 2, memberKeys: MEMBER_KEYS };
  /** The first member's key in the raw hex form `PublicKey.toStringRaw` returns. */
  const FIRST_MEMBER_HEX = "0317f4a36e88217ef559aae2316440abc651a4af39726b99b1e40c649b6fa9cf16";

  it("answers yes for a key the council's threshold is built on", () => {
    expect(councilHoldsKey(council, FIRST_MEMBER_HEX)).toBe(true);
  });

  it("answers no for a key that holds no seat", () => {
    const stranger = "02" + FIRST_MEMBER_HEX.slice(2);

    expect(councilHoldsKey(council, stranger)).toBe(false);
  });

  // The seat comes from the account's key rather than from a signature row, so unlike
  // `isSignedByKey` it is a whole key on both sides. A prefix that matched would hand a seat to
  // anyone whose key starts the same way.
  it("answers no for a prefix of a member's key", () => {
    expect(councilHoldsKey(council, FIRST_MEMBER_HEX.slice(0, 8))).toBe(false);
  });

  it("answers no on a council with no members", () => {
    expect(councilHoldsKey({ threshold: 1, memberKeys: [] }, FIRST_MEMBER_HEX)).toBe(false);
  });
});

describe("fetchProposerAccountIds", () => {
  const EXECUTOR = "0.0.10671156";
  const PROPOSER_EVM = "0x000000000000000000000000000000000000a2d4";
  /**
   * An address the role names that never became a Hedera account, so Mirror answers 404 for it.
   * Spelled EIP-55 checksummed because that is how it comes back out of the role read.
   */
  const STRANGER_EVM = "0x00000000000000000000000000000000DeaDBeef";
  /** keccak256("PROPOSER_ROLE"), the identifier the executor declares for the role. */
  const PROPOSER_ROLE = "b09aa5aeb3702cfd50b6b62bc4532604938f21248a27a1d5ca736082b6819cc1";

  const word = (value: string) => `0x${value.replace("0x", "").padStart(64, "0")}`;
  const jsonRpc = (result: string) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));

  /** One role member, then the Mirror read that turns its address into an account id. */
  function stubOneProposer(accountId: string, key: unknown = governanceAccount.key) {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRpc(word("1")))
      .mockResolvedValueOnce(jsonRpc(word(PROPOSER_EVM)))
      .mockResolvedValue(new Response(JSON.stringify({ ...governanceAccount, account: accountId, key })));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  /** Two role members, the second an address Mirror has no account for. */
  function stubProposerAndStranger(accountId: string) {
    const account = new Response(JSON.stringify({ ...governanceAccount, account: accountId }));
    const notFound = new Response("Not found", { status: 404 });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonRpc(word("2")))
        .mockResolvedValueOnce(jsonRpc(word(PROPOSER_EVM)))
        .mockResolvedValueOnce(jsonRpc(word(STRANGER_EVM)))
        .mockResolvedValueOnce(account)
        .mockResolvedValueOnce(notFound),
    );
  }

  it("asks the executor for the holders of PROPOSER_ROLE", async () => {
    const fetchMock = stubOneProposer("0.0.10671142");

    await fetchProposerAccountIds({ executorContractId: EXECUTOR, network: "testnet", rpcUrl: "https://relay.test" });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).params[0].data).toContain(PROPOSER_ROLE);
  });

  it("returns account ids, which is what Mirror lists schedules by", async () => {
    stubOneProposer("0.0.10671142");

    const proposers = await fetchProposerAccountIds({
      executorContractId: EXECUTOR,
      network: "testnet",
      rpcUrl: "https://relay.test",
    });

    expect(proposers.accountIds).toEqual(["0.0.10671142"]);
  });

  const lookUpProposers = () =>
    fetchProposerAccountIds({ executorContractId: EXECUTOR, network: "testnet", rpcUrl: "https://relay.test" });

  it("reads a single-key proposer's key in the form a council seat is written", async () => {
    stubOneProposer("0.0.10671142", {
      _type: "ECDSA_SECP256K1",
      key: "0317f4a36e88217ef559aae2316440abc651a4af39726b99b1e40c649b6fa9cf16",
    });

    await expect(lookUpProposers()).resolves.toMatchObject({
      proposers: [{ accountId: "0.0.10671142", key: MEMBER_KEYS[0] }],
    });
  });

  it("reads an ED25519 proposer's key as base64 too", async () => {
    const ed25519 = "11".repeat(32);
    stubOneProposer("0.0.10671142", { _type: "ED25519", key: ed25519 });

    const { proposers } = await lookUpProposers();

    expect(proposers[0].key).toBe(Buffer.from(ed25519, "hex").toString("base64"));
  });

  it("gives a proposer whose key is a threshold key no seat key", async () => {
    stubOneProposer("0.0.10671142");

    await expect(lookUpProposers()).resolves.toMatchObject({
      proposers: [{ accountId: "0.0.10671142", key: null }],
    });
  });

  it("keeps the proposers it could resolve when one address belongs to no account", async () => {
    stubProposerAndStranger("0.0.10671142");

    const proposers = await fetchProposerAccountIds({
      executorContractId: EXECUTOR,
      network: "testnet",
      rpcUrl: "https://relay.test",
    });

    expect(proposers.accountIds).toEqual(["0.0.10671142"]);
  });

  it("names the address it could not resolve, so the inbox can say it is partial", async () => {
    stubProposerAndStranger("0.0.10671142");

    const proposers = await fetchProposerAccountIds({
      executorContractId: EXECUTOR,
      network: "testnet",
      rpcUrl: "https://relay.test",
    });

    expect(proposers.unresolvable).toEqual([STRANGER_EVM]);
  });
});
