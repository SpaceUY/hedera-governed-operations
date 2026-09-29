"use client";

import { type MirrorQueryOptions, getDefaultMirrorNetwork, mirrorQueryKey } from "./mirrorQuery";
import {
  type ManifestCheck,
  assertReleaseTopicIsSigned,
  checkImplementationAgainstManifest,
} from "@sh/core/governance/releaseManifest";
import { UnsignedTopicError, type UnsignedTopicReason, isMirrorEntityRef } from "@sh/core/mirror";
import { useQuery } from "@tanstack/react-query";

type ReleaseCheckOptions = Omit<MirrorQueryOptions, "pollIntervalMs">;

/**
 * What the release topic says of an implementation. A topic anyone can write to answers nothing:
 * its releases are unsigned claims, so they are not read at all.
 */
export type ReleaseTopicAnswer =
  | { status: "unsigned"; reason: UnsignedTopicReason }
  | { status: "read"; check: ManifestCheck };

async function readReleaseTopic(implementation: string, topicId: string, network: string): Promise<ReleaseTopicAnswer> {
  try {
    await assertReleaseTopicIsSigned(topicId, { network });
  } catch (error) {
    if (error instanceof UnsignedTopicError) return { status: "unsigned", reason: error.reason };
    throw error;
  }
  return { status: "read", check: await checkImplementationAgainstManifest(implementation, topicId, { network }) };
}

/**
 * Whether the release topic vouches for the code deployed at `implementation` — the same checks the
 * co-signing agent runs before it signs an upgrade: the topic has a submit key, then a release on it
 * names this code. Not polled: a release is published once, by hand.
 */
export function useReleaseCheck(implementation: string, topicId: string | null, options: ReleaseCheckOptions = {}) {
  const network = options.network ?? getDefaultMirrorNetwork();
  const topic = topicId?.trim() ?? "";

  return useQuery<ReleaseTopicAnswer, Error>({
    queryKey: mirrorQueryKey(network, "release-check", topic, implementation.toLowerCase()),
    queryFn: () => readReleaseTopic(implementation, topic, network),
    // A malformed topic id is left to fail the read, so the screen says it could not read the topic
    // rather than loading forever.
    enabled: (options.enabled ?? true) && topic.length > 0 && isMirrorEntityRef(implementation),
    retry: false,
  });
}
