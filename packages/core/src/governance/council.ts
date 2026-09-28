/**
 * Who governs, read from the two layers that answer it. Who *approves* is the governance account's
 * threshold key, a native Hedera key the network evaluates; who may *propose* is `PROPOSER_ROLE` on
 * the executor, an EVM role. Both are read from the ledger rather than from configuration, because
 * rotating the council and granting the role are themselves proposals: an environment variable
 * would start lying the moment one is approved.
 *
 * The Mirror Node returns a threshold key as `ProtobufEncoded`, an opaque blob, because it is not a
 * single public key. Decoding it needs the protobuf definitions the network is built from, which is
 * why `@hiero-ledger/proto` is a dependency here; the Hiero SDK already ships the same package, so
 * it costs nothing in the bundle and its version follows the SDK's.
 */
import {
  type MirrorKey,
  type MirrorSchedule,
  type MirrorScheduleSignature,
  compareMirrorTimestamps,
  fetchAccount,
} from "../mirror";
import type { HederaNetworkName } from "../network";
import { createRelayClient } from "../relayClient";
import { proto } from "@hiero-ledger/proto";
import { ContractId } from "@hiero-ledger/sdk";
import { type Address, keccak256, parseAbi, toHex } from "viem";

/** How Mirror labels a key it cannot express as one public key: a key list, with or without a threshold. */
const PROTOBUF_ENCODED = "ProtobufEncoded";

/** `AccessControlEnumerable` is what makes the role enumerable; plain `AccessControl` only answers yes or no. */
const EXECUTOR_ROLES_ABI = parseAbi([
  "function getRoleMemberCount(bytes32 role) view returns (uint256)",
  "function getRoleMember(bytes32 role, uint256 index) view returns (address)",
]);

/** A role is identified by the hash of its name, the way the contract declares it. */
const PROPOSER_ROLE = keccak256(toHex("PROPOSER_ROLE"));

export type CouncilKey = {
  /** Signatures the network waits for before it runs a proposal: the m of "m of n". */
  threshold: number;
  /** The n member keys, base64-encoded the way Mirror writes a schedule's `public_key_prefix`. */
  memberKeys: string[];
};

export type ThresholdProgress = {
  /** Council members that have signed: the numerator of "m of n". */
  signed: number;
  /** Signatures the proposal needs before the network runs it. */
  threshold: number;
  /** Which members signed, in the council's own order so the list does not reshuffle between polls. */
  signedBy: string[];
};

/**
 * Mirror writes a `ProtobufEncoded` key as bare hex, with no `0x`. viem's `hexToBytes` — which
 * `encode.ts` next door imports under that exact name — requires the prefix, and handed this input
 * it throws; this one handed a prefixed string would read `0x` as `NaN` and quietly produce a zero
 * byte, decoding the council into something plausible and wrong. Hence the name: it says which of
 * the two forms it takes.
 */
function bytesFromUnprefixedHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The form keys are compared in; see `isSignedByKey` for why it is not base64. */
function base64ToHex(base64: string): string {
  const binary = atob(base64);
  let hex = "";
  for (let index = 0; index < binary.length; index += 1) {
    hex += binary.charCodeAt(index).toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * A member is one public key. A key list nested inside the council's key would still be valid on
 * Hedera, but no signature could ever be matched to it: Mirror records signatures as single keys.
 */
function memberKeyOf(member: proto.IKey): string {
  const publicKey = member.ed25519 ?? member.ECDSASecp256k1;
  if (!publicKey) {
    throw new Error(
      "A member of the governance key is not a single public key (it is a nested list or a contract id). " +
        "Signatures are recorded one public key at a time, so such a member could never be shown as approved.",
    );
  }
  return toBase64(publicKey);
}

/**
 * The council a key describes. Exported because a council rotation proposes its next composition as
 * a `Key` inside the scheduled body, and reading that is the same problem as reading the current one
 * off the governance account.
 */
export function councilKeyOf(key: proto.IKey): CouncilKey {
  const { thresholdKey, keyList } = key;
  if (thresholdKey?.keys?.keys?.length && thresholdKey.threshold) {
    return { threshold: thresholdKey.threshold, memberKeys: thresholdKey.keys.keys.map(memberKeyOf) };
  }
  // A plain key list is the n-of-n case: the network waits for every member.
  if (keyList?.keys?.length) {
    return { threshold: keyList.keys.length, memberKeys: keyList.keys.map(memberKeyOf) };
  }
  throw new Error("The governance account's key is neither a threshold key nor a key list, so it has no members");
}

/**
 * Reads the council out of the governance account's key. Throws when the account holds a single
 * key: one signature would then be enough to move the treasury, which is the setup this whole
 * mechanism exists to avoid, so failing loudly beats showing "1 of 1".
 */
export async function fetchCouncilKey(governanceAccountId: string, network: HederaNetworkName): Promise<CouncilKey> {
  const { key } = await fetchAccount(governanceAccountId, { network });
  if (key?._type !== PROTOBUF_ENCODED) {
    throw new Error(
      `Governance account ${governanceAccountId} holds a ${key?._type ?? "missing"} key, not a threshold key. ` +
        "Anything it pays for would run on a single signature, with no council to approve it.",
    );
  }
  return councilKeyOf(proto.Key.decode(bytesFromUnprefixedHex(key.key)));
}

/**
 * Whether a schedule carries a signature by this key, which is the one rule everything about
 * approval is built on. The key is hex without `0x`, the form `PublicKey.toStringRaw` returns.
 *
 * The comparison happens in hex because `public_key_prefix` is a prefix: every signer seen so far
 * sends the whole key, but a shorter one is legal, and base64 packs three bytes into four
 * characters, so a prefix of the bytes is not a prefix of the base64. An empty prefix matches
 * nothing rather than everything.
 */
export function isSignedByKey(schedule: MirrorSchedule, publicKeyHex: string): boolean {
  return schedule.signatures.some(signature => carriesKey(signature, publicKeyHex));
}

function carriesKey({ public_key_prefix }: MirrorScheduleSignature, publicKeyHex: string): boolean {
  const prefix = base64ToHex(public_key_prefix);
  return prefix.length > 0 && publicKeyHex.startsWith(prefix);
}

/**
 * The consensus timestamp at which a council member's approval reached the schedule, or null when it
 * never did. A member can appear on several rows — its own signature and the payer row of a
 * `ScheduleSign` it paid for later — and the approval is the earliest of them.
 */
export function memberSignedAt(schedule: MirrorSchedule, memberKey: string): string | null {
  const publicKeyHex = base64ToHex(memberKey);
  const timestamps = schedule.signatures
    .filter(signature => carriesKey(signature, publicKeyHex))
    .map(signature => signature.consensus_timestamp)
    .sort(compareMirrorTimestamps);
  return timestamps[0] ?? null;
}

/**
 * How far a proposal is from running, which is not how many signatures Mirror lists. Two entries
 * there never count: the one `ScheduleCreate` adds for whoever paid to open the proposal, and the
 * one every `ScheduleSign` adds for whoever paid to submit it. Both are payers, and paying is not
 * approving.
 *
 * The rule that survives both is to count council members, not signatures: a member is either in or
 * out, however many rows carry its key, and a payer that happens to be a member — which is the
 * common case, since the same person usually opens a proposal and approves it — is counted once and
 * legitimately. `signatures.length` would have said two for a proposal one member has approved.
 */
export function countThresholdSignatures(schedule: MirrorSchedule, council: CouncilKey): ThresholdProgress {
  const signedBy = council.memberKeys.filter(member => isSignedByKey(schedule, base64ToHex(member)));

  return { signed: signedBy.length, threshold: council.threshold, signedBy };
}

/** Mirror's names for a key that is one public key, the only kind that can also be a council seat. */
const SINGLE_KEY_TYPES = ["ED25519", "ECDSA_SECP256K1"];

/**
 * An account's key as a council seat writes it, or null when it is not one public key. Mirror writes
 * a single public key as bare hex; a seat is the same bytes in base64.
 */
export function memberKeyOfAccount(key: MirrorKey | null): string | null {
  if (!key || !SINGLE_KEY_TYPES.includes(key._type)) return null;
  return toBase64(bytesFromUnprefixedHex(key.key));
}

export type ProposerLookup = {
  executorContractId: string;
  network: HederaNetworkName;
  /** JSON-RPC relay endpoint; the browser holds no operator key, so a `ContractCallQuery` is not an option. */
  rpcUrl: string;
};

export type Proposer = {
  accountId: string;
  /**
   * The account's public key in the form `CouncilKey.memberKeys` uses, so a proposer who also holds
   * a seat can be recognised as the same person. Null when the account's key is not a single public
   * key (a threshold key or a key list), which can never be a seat.
   */
  key: string | null;
};

export type ProposerAccounts = {
  /** Whose schedules the inbox is assembled from. */
  accountIds: string[];
  /** The same accounts with their keys, read in the same Mirror request. */
  proposers: Proposer[];
  /**
   * Role holders whose address the Mirror Node has no account for, kept as the addresses they were
   * granted under. Their proposals are missing from the inbox, which is the same partial answer a
   * proposer Mirror cannot be read for already produces.
   */
  unresolvable: string[];
};

/**
 * The accounts allowed to register proposals, which is also the set the inbox is assembled from:
 * Mirror can only list schedules by their creator, so knowing who proposes is what makes the list
 * possible at all.
 *
 * The role holds EVM addresses and Mirror wants `0.0.x` account ids, and the two are not
 * interconvertible here — an account created from an ECDSA key is reached by a key-derived alias,
 * not by the long-zero form of its id — so each address is resolved through the Mirror Node.
 *
 * An address the role names need not be an account at all: `grantRole` takes any address, and an
 * EVM address only becomes a Hedera entity once something funds it, so Mirror answers 404 for one
 * that was granted the role early or by mistake. That is one proposer missing from the list, not a
 * reason to leave the screen with no council: the council key itself read fine.
 */
export async function fetchProposerAccountIds({
  executorContractId,
  network,
  rpcUrl,
}: ProposerLookup): Promise<ProposerAccounts> {
  const relay = createRelayClient(rpcUrl);
  const address = `0x${ContractId.fromString(executorContractId).toEvmAddress()}` as Address;
  const readRole = { address, abi: EXECUTOR_ROLES_ABI } as const;

  const memberCount = await relay.readContract({
    ...readRole,
    functionName: "getRoleMemberCount",
    args: [PROPOSER_ROLE],
  });

  const addresses = await Promise.all(
    Array.from({ length: Number(memberCount) }, (_unused, index) =>
      relay.readContract({ ...readRole, functionName: "getRoleMember", args: [PROPOSER_ROLE, BigInt(index)] }),
    ),
  );

  const readings = await Promise.allSettled(addresses.map(member => fetchAccount(member, { network })));

  // The same account can hold the role under both its long-zero address and its alias.
  const byAccountId = new Map<string, Proposer>();
  for (const reading of readings) {
    if (reading.status !== "fulfilled") continue;
    const { account, key } = reading.value;
    byAccountId.set(account, { accountId: account, key: memberKeyOfAccount(key) });
  }
  return {
    accountIds: [...byAccountId.keys()],
    proposers: [...byAccountId.values()],
    unresolvable: addresses.filter((_unused, index) => readings[index].status === "rejected"),
  };
}
