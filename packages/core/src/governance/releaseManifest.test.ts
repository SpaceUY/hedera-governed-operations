import { fetchContract, fetchDecodedTopicMessagePages } from "../mirror";
import {
  RELEASE_MANIFEST_SCHEMA,
  type ReleaseManifest,
  assertReleaseTopicIsSigned,
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
  fetchDecodedTopicMessagePages: vi.fn(),
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

/** One decoded message as `fetchDecodedTopicMessagePages` returns them. */
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

const mockTopic = (messages: unknown[], truncated = false): void => {
  vi.mocked(fetchDecodedTopicMessagePages).mockResolvedValue({
    messages: messages.map((json, index) => message(json, index + 1)),
    truncated,
  } as never);
};

/** The topic itself, which `assertTopicIsSigned` reads straight from the Mirror Node. */
const mockTopicKeys = (submitKey: unknown, deleted = false): void => {
  const topic = { topic_id: TOPIC, memo: "releases", deleted, submit_key: submitKey, admin_key: null };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(topic))));
};

const mockContract = (runtimeBytecode: string | null): void => {
  vi.mocked(fetchContract).mockResolvedValue({ runtime_bytecode: runtimeBytecode } as never);
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

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

    const { manifests } = await fetchReleaseManifests(TOPIC, { network: "testnet" });

    expect(manifests).toHaveLength(1);
    expect(manifests[0]).toMatchObject({ version: "v2.0.0", sequenceNumber: 2 });
  });

  it("passes on that the read stopped at the page bound rather than at the end of the topic", async () => {
    mockTopic([JSON.parse(buildReleaseManifestMessage(manifest()))], true);

    expect((await fetchReleaseManifests(TOPIC)).truncated).toBe(true);
  });
});

describe("assertReleaseTopicIsSigned", () => {
  it("passes a topic only the submit key can write to", async () => {
    mockTopicKeys({ _type: "ED25519", key: "302a300506032b6570032100aa" });

    await expect(assertReleaseTopicIsSigned(TOPIC)).resolves.toMatchObject({ topic_id: TOPIC });
  });

  it("refuses a topic anyone can publish to, which is what makes its manifests unsigned claims", async () => {
    mockTopicKeys(null);

    await expect(assertReleaseTopicIsSigned(TOPIC)).rejects.toMatchObject({
      name: "UnsignedTopicError",
      reason: "noSubmitKey",
      message: expect.stringMatching(/has no submit key/),
    });
  });

  it("refuses a deleted topic", async () => {
    mockTopicKeys({ _type: "ED25519", key: "302a300506032b6570032100aa" }, true);

    await expect(assertReleaseTopicIsSigned(TOPIC)).rejects.toMatchObject({
      name: "UnsignedTopicError",
      reason: "deleted",
      message: expect.stringMatching(/is deleted/),
    });
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
    expect(check).toMatchObject({ failure: "notNamed", searched: "topic" });
    if (!check.matched) expect(check.reason).toContain("no release on topic");
  });

  it("says it read a window, not the topic, when the page bound ended the search", async () => {
    // Otherwise a topic flooded past the bound would report "no release names it" — a claim about
    // the whole topic made from part of it.
    mockContract(RUNTIME);
    mockTopic([JSON.parse(buildReleaseManifestMessage(manifest({ implementation: "0x01" })))], true);

    const check = await checkImplementationAgainstManifest(IMPLEMENTATION, TOPIC);
    expect(check).toMatchObject({ matched: false, failure: "notNamed", searched: "recentReleases" });
    if (!check.matched) expect(check.reason).toContain("most recent releases on topic");
  });

  it("refuses when a release names the address but the code there has changed", async () => {
    // The case an allowlist of addresses cannot catch: the address is blessed, the code is not.
    mockContract("0x60806040deadbeef");
    mockTopic([JSON.parse(buildReleaseManifestMessage(manifest()))]);

    const check = await checkImplementationAgainstManifest(IMPLEMENTATION, TOPIC);
    expect(check).toMatchObject({ matched: false, failure: "codeChanged", versions: ["v2.0.0"] });
    if (!check.matched) {
      expect(check.reason).toContain("does not match the release published for v2.0.0");
    }
  });

  it("refuses when the address holds no code", async () => {
    mockContract("0x");
    mockTopic([JSON.parse(buildReleaseManifestMessage(manifest()))]);

    const check = await checkImplementationAgainstManifest(IMPLEMENTATION, TOPIC);
    expect(check).toMatchObject({ matched: false, failure: "noCode" });
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
