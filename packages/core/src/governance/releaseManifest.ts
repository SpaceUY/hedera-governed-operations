/**
 * Release manifests: the record that says a given implementation address holds a build the team
 * published, kept on an HCS topic where anyone can read it.
 *
 * An upgrade proposal says "point the proxy at 0xabc…". On its own that is unanswerable — the
 * council can see the address and cannot see what is at it, and an allowlist of addresses in a
 * config file only moves the question to whoever edits the file. A manifest closes it: at release
 * time the pipeline publishes the address together with the hash of the code actually deployed
 * there, signed by the topic's submit key and timestamped by consensus. Checking an upgrade is then
 * a comparison anyone can repeat, including from HashScan.
 *
 * What it does not do is attest the source. That is Sourcify's job, and the two compose: Sourcify
 * says the source matches the deployed code, the manifest says the deployed code is the build the
 * team blessed for this version.
 */
import { type MirrorRequestOptions, fetchContract, fetchDecodedTopicMessages } from "../mirror";
import { type Hex, isHex, keccak256 } from "viem";

/** Carried in every message so a topic can gain another kind of record without breaking readers. */
export const RELEASE_MANIFEST_SCHEMA = "governed-operations/release-manifest/1";

/** How far back a check reads. A release topic gets one message per release, not per block. */
export const MANIFEST_HISTORY = 100;

export type ReleaseManifest = {
  /** The release this build belongs to, as the team numbers them. */
  version: string;
  /** Which contract it is, by name — `AcmeVault`, not an address. */
  contract: string;
  /** The implementation address the proxy would be pointed at. */
  implementation: string;
  /** keccak256 of the runtime bytecode deployed at that address. */
  bytecodeHash: string;
  /** The commit the build came from, so a reader can get back to the source. */
  commit: string;
  /** When the pipeline published it. Consensus timestamps the message anyway; this is the build's own clock. */
  publishedAt: string;
};

export type PublishedManifest = ReleaseManifest & {
  /** Consensus sequence number, which is how a reader cites one on HashScan. */
  sequenceNumber: number;
  consensusTimestamp: string;
};

const FIELDS = ["version", "contract", "implementation", "bytecodeHash", "commit", "publishedAt"] as const;

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** The message a release publishes. Kept next to the parser so the two cannot drift. */
export function buildReleaseManifestMessage(manifest: ReleaseManifest): string {
  return JSON.stringify({ schema: RELEASE_MANIFEST_SCHEMA, ...manifest });
}

/**
 * Anything on the topic that is not a well-formed manifest of this schema is not a manifest. It is
 * returned as null rather than thrown: a topic anyone can write to will collect noise, and one bad
 * message must not blind the check to the good ones around it.
 */
export function parseReleaseManifest(payload: unknown): ReleaseManifest | null {
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as Record<string, unknown>;
  if (record.schema !== RELEASE_MANIFEST_SCHEMA) return null;
  if (!FIELDS.every(field => isNonEmptyString(record[field]))) return null;
  if (!isHex(record.bytecodeHash as string)) return null;

  return {
    version: record.version as string,
    contract: record.contract as string,
    implementation: record.implementation as string,
    bytecodeHash: (record.bytecodeHash as string).toLowerCase(),
    commit: record.commit as string,
    publishedAt: record.publishedAt as string,
  };
}

/**
 * The hash a manifest carries and a check recomputes: keccak256 over the **deployed** code.
 * `GET /contracts/{id}` also returns `bytecode`, which is the creation code and comes back empty for
 * anything deployed through the relay, so hashing that would compare nothing against nothing.
 */
export function hashRuntimeBytecode(runtimeBytecode: string): Hex {
  const code = runtimeBytecode.startsWith("0x") ? runtimeBytecode : `0x${runtimeBytecode}`;
  if (!isHex(code)) throw new Error(`Runtime bytecode is not hex: ${runtimeBytecode.slice(0, 16)}…`);
  return keccak256(code.toLowerCase() as Hex);
}

export async function fetchReleaseManifests(
  topicId: string,
  options: MirrorRequestOptions = {},
): Promise<PublishedManifest[]> {
  const messages = await fetchDecodedTopicMessages(topicId, { ...options, limit: MANIFEST_HISTORY, order: "desc" });

  return messages.flatMap(message => {
    const manifest = parseReleaseManifest(message.json);
    if (!manifest) return [];
    return [
      {
        ...manifest,
        sequenceNumber: message.sequence_number,
        consensusTimestamp: message.consensus_timestamp,
      },
    ];
  });
}

export type ManifestCheck = { matched: true; manifest: PublishedManifest } | { matched: false; reason: string };

const sameAddress = (left: string, right: string): boolean => left.toLowerCase() === right.toLowerCase();

/**
 * Whether the code deployed at `implementation` is a build the topic published.
 *
 * The three failures are deliberately distinct, because they mean different things to whoever reads
 * the refusal: nothing was ever published for this address, something was published and the code no
 * longer matches it, or the address holds no code to check at all. The middle one is the reason this
 * exists — an address can be in an allowlist and hold something else entirely.
 */
export async function checkImplementationAgainstManifest(
  implementation: string,
  topicId: string,
  options: MirrorRequestOptions = {},
): Promise<ManifestCheck> {
  const [contract, manifests] = await Promise.all([
    fetchContract(implementation, options),
    fetchReleaseManifests(topicId, options),
  ]);

  const runtime = contract.runtime_bytecode;
  if (!runtime || runtime === "0x") {
    return { matched: false, reason: `${implementation} has no deployed code to check against a release` };
  }

  const deployed = hashRuntimeBytecode(runtime);
  const named = manifests.filter(manifest => sameAddress(manifest.implementation, implementation));
  if (named.length === 0) {
    return { matched: false, reason: `no release on topic ${topicId} names the implementation ${implementation}` };
  }

  const match = named.find(manifest => manifest.bytecodeHash === deployed);
  if (!match) {
    const versions = [...new Set(named.map(manifest => manifest.version))].join(", ");
    return {
      matched: false,
      reason: `the code at ${implementation} does not match the release published for ${versions} (deployed ${deployed})`,
    };
  }

  return { matched: true, manifest: match };
}
