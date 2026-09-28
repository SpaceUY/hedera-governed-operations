import type { ManifestCheck } from "@sh/core/governance/releaseManifest";

/** What the upgrade form knows about the release topic's answer at a given moment. */
export type ReleaseCheckState =
  | { status: "loading" }
  | { status: "unreadable" }
  | { status: "read"; check: ManifestCheck };

const releaseAnswer = (check: ManifestCheck, topicId: string): string => {
  if (check.matched) {
    return `Release ${check.manifest.version} published on topic ${topicId} — its code hash matches the deployed implementation.`;
  }
  switch (check.failure) {
    case "notNamed":
      return check.searched === "topic"
        ? `No release on topic ${topicId} names this implementation.`
        : `None of the most recent releases on topic ${topicId} names this implementation.`;
    case "codeChanged":
      return `Release ${check.versions.join(", ")} on topic ${topicId} names this implementation, but the code deployed there does not match its hash.`;
    case "noCode":
      return `This implementation holds no deployed code to check against the releases on topic ${topicId}.`;
  }
};

/** What the vault upgrade says: why it cannot be offered here, and what the release topic says of its implementation. */
export const VAULT_UPGRADE_COPY = {
  targetMissing:
    "The vault's next implementation is not deployed on this network, so a vault upgrade cannot be proposed yet. " +
    "Run `yarn hardhat:deploy --network hederaTestnet` to deploy it; paying a supplier works without it.",
  /** The release line: whether a published release vouches for the code at the implementation. */
  release: (state: ReleaseCheckState, topicId: string): string => {
    if (state.status === "loading") return `Checking the releases on topic ${topicId}…`;
    if (state.status === "unreadable") return `Couldn't read the release topic ${topicId}.`;
    return releaseAnswer(state.check, topicId);
  },
  releaseTopicLink: "View the topic on HashScan",
} as const;
