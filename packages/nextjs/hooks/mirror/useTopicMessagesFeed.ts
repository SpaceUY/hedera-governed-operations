"use client";

import { type MirrorQueryOptions, getDefaultMirrorNetwork, mirrorQueryKey } from "./mirrorQuery";
import { useQuery } from "@tanstack/react-query";
import { type DecodedTopicMessage, fetchDecodedTopicMessages, isValidEntityId } from "~~/services/mirror";

const DEFAULT_FEED_REFETCH_MS = 15_000;

export type TopicMessagesFeedOptions = Omit<MirrorQueryOptions, "pollIntervalMs"> & {
  limit?: number;
  order?: "asc" | "desc";
  /** Feed refresh interval; `false` disables it. */
  refetchInterval?: number | false;
};

/** Reads a topic's latest messages straight from Mirror, already base64-decoded (text + JSON when parseable). */
export function useTopicMessagesFeed(topicId: string | null | undefined, options: TopicMessagesFeedOptions = {}) {
  const network = options.network ?? getDefaultMirrorNetwork();
  const { limit, order } = options;
  const id = topicId?.trim() ?? "";

  return useQuery<DecodedTopicMessage[], Error>({
    queryKey: mirrorQueryKey(network, "topic-feed", id, String(limit ?? ""), order ?? ""),
    queryFn: () => fetchDecodedTopicMessages(id, { network, limit, order }),
    enabled: (options.enabled ?? true) && isValidEntityId(id),
    refetchInterval: options.refetchInterval ?? DEFAULT_FEED_REFETCH_MS,
  });
}
