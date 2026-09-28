"use client";

import { type MirrorQueryOptions, getDefaultMirrorNetwork, mirrorQueryKey } from "./mirrorQuery";
import { type ManifestCheck, checkImplementationAgainstManifest } from "@sh/core/governance/releaseManifest";
import { isMirrorEntityRef } from "@sh/core/mirror";
import { useQuery } from "@tanstack/react-query";

type ReleaseCheckOptions = Omit<MirrorQueryOptions, "pollIntervalMs">;

/**
 * Whether the release topic vouches for the code deployed at `implementation` — the same check the
 * co-signing agent runs before it signs an upgrade. Not polled: a release is published once, by hand.
 */
export function useReleaseCheck(implementation: string, topicId: string | null, options: ReleaseCheckOptions = {}) {
  const network = options.network ?? getDefaultMirrorNetwork();
  const topic = topicId?.trim() ?? "";

  return useQuery<ManifestCheck, Error>({
    queryKey: mirrorQueryKey(network, "release-check", topic, implementation.toLowerCase()),
    queryFn: () => checkImplementationAgainstManifest(implementation, topic, { network }),
    // A malformed topic id is left to fail the read, so the screen says it could not read the topic
    // rather than loading forever.
    enabled: (options.enabled ?? true) && topic.length > 0 && isMirrorEntityRef(implementation),
    retry: false,
  });
}
