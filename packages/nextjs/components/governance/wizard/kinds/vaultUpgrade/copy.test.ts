import { VAULT_UPGRADE_COPY } from "./copy";
import type { ManifestCheck, PublishedManifest } from "@sh/core/governance/releaseManifest";
import { describe, expect, it } from "vitest";

const TOPIC = "0.0.4242";
const MANIFEST: PublishedManifest = {
  version: "v2.0.0",
  contract: "AcmeVault",
  implementation: "0x00000000000000000000000000000000000abcde",
  bytecodeHash: "0x01",
  commit: "a1b2c3d",
  publishedAt: "2026-09-25T00:00:00.000Z",
  sequenceNumber: 1,
  consensusTimestamp: "1700000001.000000000",
};

const read = (check: Parameters<typeof VAULT_UPGRADE_COPY.release>[0]) => VAULT_UPGRADE_COPY.release(check, TOPIC);

describe("VAULT_UPGRADE_COPY.release", () => {
  it("names the release whose hash matches the deployed code", () => {
    expect(read({ status: "read", check: { matched: true, manifest: MANIFEST } })).toBe(
      "Release v2.0.0 published on topic 0.0.4242 — its code hash matches the deployed implementation.",
    );
  });

  it("says no release names the implementation when the whole topic was read", () => {
    const check = { matched: false, reason: "", failure: "notNamed", searched: "topic" } as const;
    expect(read({ status: "read", check })).toBe("No release on topic 0.0.4242 names this implementation.");
  });

  it("claims only the recent releases when the read stopped at its page bound", () => {
    const check = { matched: false, reason: "", failure: "notNamed", searched: "recentReleases" } as const;
    expect(read({ status: "read", check })).toBe(
      "None of the most recent releases on topic 0.0.4242 names this implementation.",
    );
  });

  it("says the code no longer matches when a release names the address", () => {
    const check: ManifestCheck = { matched: false, reason: "", failure: "codeChanged", versions: ["v2.0.0"] };
    expect(read({ status: "read", check })).toBe(
      "Release v2.0.0 on topic 0.0.4242 names this implementation, but the code deployed there does not match its hash.",
    );
  });

  it("says there is nothing to check when the address holds no code", () => {
    const check = { matched: false, reason: "", failure: "noCode" } as const;
    expect(read({ status: "read", check })).toContain("holds no deployed code");
  });

  it("says the topic could not be read rather than that nothing was published", () => {
    expect(read({ status: "unreadable" })).toBe("Couldn't read the release topic 0.0.4242.");
  });

  it("says a topic anyone can publish to, or a deleted one, vouches for nothing", () => {
    expect(read({ status: "unsigned", reason: "noSubmitKey" })).toBe(
      "Topic 0.0.4242 has no submit key, so anyone can publish a release on it — its releases prove nothing, and the co-signing agent will not use it.",
    );
    expect(read({ status: "unsigned", reason: "deleted" })).toBe(
      "Topic 0.0.4242 is deleted, so no release on it can vouch for this implementation, and the co-signing agent will not use it.",
    );
  });

  it("says it is checking while the read is in flight", () => {
    expect(read({ status: "loading" })).toBe("Checking the releases on topic 0.0.4242…");
  });
});
