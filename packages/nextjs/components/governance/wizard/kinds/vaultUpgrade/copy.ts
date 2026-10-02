import type { ManifestCheck } from "@sh/core/governance/releaseManifest";
import type { UnsignedTopicReason } from "@sh/core/mirror";
import type { ReleaseTopicAnswer } from "~~/hooks/mirror/useReleaseCheck";

/** What the upgrade form knows about the release topic's answer at a given moment. */
export type ReleaseCheckState =
  | { status: "loading" }
  | { status: "unreadable" }
  /** The topic may have read fine: it was the implementation's code that could not be fetched. */
  | { status: "implementationUnreadable" }
  | ReleaseTopicAnswer;

/** The co-signing agent refuses to start on such a topic, so the line says why nothing on it counts. */
const UNSIGNED_TOPIC: Record<UnsignedTopicReason, (topicId: string) => string> = {
  noSubmitKey: topicId =>
    `Topic ${topicId} has no submit key, so anyone can publish a release on it — its releases prove nothing, and the co-signing agent will not use it.`,
  deleted: topicId =>
    `Topic ${topicId} is deleted, so no release on it can vouch for this implementation, and the co-signing agent will not use it.`,
};

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
  alreadyRunning:
    "The vault already runs v2, so there is nothing to upgrade: v2's initializer has run once and cannot run " +
    "again, so the call could only revert and the governance account would pay for it.",
  /** The release line: whether a published release vouches for the code at the implementation. */
  release: (state: ReleaseCheckState, topicId: string): string => {
    if (state.status === "loading") return `Checking the releases on topic ${topicId}…`;
    if (state.status === "unreadable") return `Couldn't read the release topic ${topicId}.`;
    if (state.status === "implementationUnreadable") {
      return (
        `Couldn't read this implementation's code on the Mirror Node, so it can't be checked against topic ${topicId} yet. ` +
        "A contract deployed moments ago can take a few seconds to appear."
      );
    }
    if (state.status === "unsigned") return UNSIGNED_TOPIC[state.reason](topicId);
    return releaseAnswer(state.check, topicId);
  },
  releaseTopicLink: "View the topic on HashScan",
} as const;
