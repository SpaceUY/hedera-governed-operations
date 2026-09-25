import { fetchContract, fetchDecodedTopicMessages } from "../mirror";
import {
  RELEASE_MANIFEST_SCHEMA,
  type ReleaseManifest,
  buildReleaseManifestMessage,
  checkImplementationAgainstManifest,
  fetchReleaseManifests,
  hashRuntimeBytecode,
  parseReleaseManifest,
} from "./releaseManifest";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../mirror", async importOriginal => ({
  ...(await importOriginal<typeof import("../mirror")>()),
  fetchContract: vi.fn(),
  fetchDecodedTopicMessages: vi.fn(),
}));

const IMPLEMENTATION = "0x00000000000000000000000000000000000abcde";
const TOPIC = "0.0.4242";
const RUNTIME = "0x6080604052348015600f57600080fd5b50";
const RUNTIME_HASH = hashRuntimeBytecode(RUNTIME);

const manifest = (overrides: Partial<ReleaseManifest> = {}): ReleaseManifest => ({
  version: "v2.0.0",
  contract: "AcmeVault",
  implementation: IMPLEMENTATION,
  bytecodeHash: RUNTIME_HASH,
  commit: "a1b2c3d",
  publishedAt: "2026-09-25T00:00:00.000Z",
  ...overrides,
});

/** One decoded message as `fetchDecodedTopicMessages` returns them. */
const message = (json: unknown, sequenceNumber = 1) => ({
  consensus_timestamp: `170000000${sequenceNumber}.000000000`,
  topic_id: TOPIC,
  sequence_number: sequenceNumber,
  message: "",
  running_hash: "",
  running_hash_version: 3,
  payer_account_id: "0.0.1001",
  text: JSON.stringify(json),
  json,
});

const mockTopic = (messages: unknown[]): void => {
  vi.mocked(fetchDecodedTopicMessages).mockResolvedValue(
    messages.map((json, index) => message(json, index + 1)) as never,
  );
};

const mockContract = (runtimeBytecode: string | null): void => {
  vi.mocked(fetchContract).mockResolvedValue({ runtime_bytecode: runtimeBytecode } as never);
};

afterEach(() => vi.clearAllMocks());

describe("hashRuntimeBytecode", () => {
  it("hashes the deployed code, prefixed or not, to the same value", () => {
    expect(hashRuntimeBytecode(RUNTIME)).toBe(hashRuntimeBytecode(RUNTIME.slice(2)));
  });

  it("is case-insensitive, since a hex string's casing carries no meaning", () => {
    expect(hashRuntimeBytecode(RUNTIME.toUpperCase().replace("0X", "0x"))).toBe(RUNTIME_HASH);
  });

  it("refuses something that is not hex rather than hashing the mistake", () => {
    expect(() => hashRuntimeBytecode("not bytecode")).toThrow(/not hex/);
  });
});

describe("parseReleaseManifest", () => {
  it("round-trips what the publisher writes", () => {
    const published = JSON.parse(buildReleaseManifestMessage(manifest()));
    expect(published.schema).toBe(RELEASE_MANIFEST_SCHEMA);
    expect(parseReleaseManifest(published)).toEqual(manifest());
  });

  it("is null for anything without this schema, so another record on the topic is not a release", () => {
    expect(parseReleaseManifest({ ...manifest(), schema: "something/else" })).toBeNull();
    expect(parseReleaseManifest({ ...manifest() })).toBeNull();
  });

  it("is null when a field is missing or empty, rather than a manifest with a blank commit", () => {
    const published = JSON.parse(buildReleaseManifestMessage(manifest()));
    expect(parseReleaseManifest({ ...published, commit: "" })).toBeNull();
    expect(parseReleaseManifest({ ...published, version: undefined })).toBeNull();
  });

  it("is null when the hash is not hex", () => {
    const published = JSON.parse(buildReleaseManifestMessage(manifest({ bytecodeHash: "deadbeef" })));
    expect(parseReleaseManifest(published)).toBeNull();
  });

  it("is null for a payload that is not an object at all", () => {
    expect(parseReleaseManifest(undefined)).toBeNull();
    expect(parseReleaseManifest("a plain message")).toBeNull();
  });
});

describe("fetchReleaseManifests", () => {
  it("keeps the manifests and drops the noise, with the sequence number a reader cites", async () => {
    mockTopic([{ hello: "not a manifest" }, JSON.parse(buildReleaseManifestMessage(manifest())), "plain text"]);

    const manifests = await fetchReleaseManifests(TOPIC, { network: "testnet" });

    expect(manifests).toHaveLength(1);
    expect(manifests[0]).toMatchObject({ version: "v2.0.0", sequenceNumber: 2 });
  });
});

describe("checkImplementationAgainstManifest", () => {
  it("matches when the deployed code hashes to what the release published", async () => {
    mockContract(RUNTIME);
    mockTopic([JSON.parse(buildReleaseManifestMessage(manifest()))]);

    const check = await checkImplementationAgainstManifest(IMPLEMENTATION, TOPIC);

    expect(check.matched).toBe(true);
    if (check.matched) expect(check.manifest.version).toBe("v2.0.0");
  });

  it("matches whatever casing the proposal's address came in", async () => {
    mockContract(RUNTIME);
    mockTopic([
      JSON.parse(
        buildReleaseManifestMessage(manifest({ implementation: IMPLEMENTATION.toUpperCase().replace("0X", "0x") })),
      ),
    ]);

    expect((await checkImplementationAgainstManifest(IMPLEMENTATION, TOPIC)).matched).toBe(true);
  });

  it("refuses when no release names the address", async () => {
    mockContract(RUNTIME);
    mockTopic([
      JSON.parse(
        buildReleaseManifestMessage(manifest({ implementation: "0x0000000000000000000000000000000000000001" })),
      ),
    ]);

    const check = await checkImplementationAgainstManifest(IMPLEMENTATION, TOPIC);
    expect(check).toMatchObject({ matched: false });
    if (!check.matched) expect(check.reason).toContain("no release on topic");
  });

  it("refuses when a release names the address but the code there has changed", async () => {
    // The case an allowlist of addresses cannot catch: the address is blessed, the code is not.
    mockContract("0x60806040deadbeef");
    mockTopic([JSON.parse(buildReleaseManifestMessage(manifest()))]);

    const check = await checkImplementationAgainstManifest(IMPLEMENTATION, TOPIC);
    expect(check).toMatchObject({ matched: false });
    if (!check.matched) {
      expect(check.reason).toContain("does not match the release published for v2.0.0");
    }
  });

  it("refuses when the address holds no code", async () => {
    mockContract("0x");
    mockTopic([JSON.parse(buildReleaseManifestMessage(manifest()))]);

    const check = await checkImplementationAgainstManifest(IMPLEMENTATION, TOPIC);
    if (!check.matched) expect(check.reason).toContain("no deployed code");
  });

  it("matches the right release when the same address was published twice", async () => {
    mockContract(RUNTIME);
    mockTopic([
      JSON.parse(
        buildReleaseManifestMessage(manifest({ version: "v1.0.0", bytecodeHash: hashRuntimeBytecode("0xdead") })),
      ),
      JSON.parse(buildReleaseManifestMessage(manifest({ version: "v2.0.0" }))),
    ]);

    const check = await checkImplementationAgainstManifest(IMPLEMENTATION, TOPIC);
    expect(check.matched).toBe(true);
    if (check.matched) expect(check.manifest.version).toBe("v2.0.0");
  });
});
