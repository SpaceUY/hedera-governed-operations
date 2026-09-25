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
import { proto } from "@hiero-ledger/proto";
import { ContractId } from "@hiero-ledger/sdk";
import { type Address, createPublicClient, http, keccak256, parseAbi, toHex } from "viem";
import { type MirrorSchedule, fetchAccount } from "~~/services/mirror";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

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

function hexToBytes(hex: string): Uint8Array {
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

/**
 * Comparing a signature to a member happens in hex because `public_key_prefix` is a prefix: every
 * signer we see sends the whole key, but a shorter one is legal, and base64 packs three bytes into
 * four characters, so a prefix of the bytes is not a prefix of the base64.
 */
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
  return councilKeyOf(proto.Key.decode(hexToBytes(key.key)));
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
  const prefixes = schedule.signatures.map(signature => base64ToHex(signature.public_key_prefix));
  const signedBy = council.memberKeys.filter(member => {
    const memberKey = base64ToHex(member);
    return prefixes.some(prefix => prefix.length > 0 && memberKey.startsWith(prefix));
  });

  return { signed: signedBy.length, threshold: council.threshold, signedBy };
}

export type ProposerLookup = {
  executorContractId: string;
  network: HederaNetworkName;
  /** JSON-RPC relay endpoint; the browser holds no operator key, so a `ContractCallQuery` is not an option. */
  rpcUrl: string;
};

/**
 * The accounts allowed to register proposals, which is also the set the inbox is assembled from:
 * Mirror can only list schedules by their creator, so knowing who proposes is what makes the list
 * possible at all.
 *
 * The role holds EVM addresses and Mirror wants `0.0.x` account ids, and the two are not
 * interconvertible here — an account created from an ECDSA key is reached by a key-derived alias,
 * not by the long-zero form of its id — so each address is resolved through the Mirror Node.
 */
export async function fetchProposerAccountIds({
  executorContractId,
  network,
  rpcUrl,
}: ProposerLookup): Promise<string[]> {
  const relay = createPublicClient({ transport: http(rpcUrl) });
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

  const accountIds = await Promise.all(
    addresses.map(async member => (await fetchAccount(member, { network })).account),
  );
  // The same account can hold the role under both its long-zero address and its alias.
  return [...new Set(accountIds)];
}
