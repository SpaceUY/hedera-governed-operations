import { type MirrorPage, type MirrorRequestOptions, assertValidEntityId, mirrorRequest } from "./client";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export type MirrorChunkInfo = {
  initial_transaction_id: {
    account_id: string;
    nonce: number;
    scheduled: boolean;
    transaction_valid_start: string;
  };
  number: number;
  total: number;
};

/** Single topic message from GET /api/v1/topics/{id}/messages */
export type MirrorTopicMessage = {
  consensus_timestamp: string;
  topic_id: string;
  message: string; // base64-encoded payload
  running_hash: string;
  running_hash_version: number;
  sequence_number: number;
  payer_account_id?: string;
  chunk_info?: MirrorChunkInfo;
};

/** Response from GET /api/v1/topics/{id}/messages */
export type TopicMessagesResponse = MirrorPage & {
  messages: MirrorTopicMessage[];
};

export type FetchTopicMessagesOptions = MirrorRequestOptions & {
  limit?: number;
  order?: "asc" | "desc";
  /** Return messages with sequence_number >= value (inclusive). */
  sequenceNumber?: number;
  /** Return messages with consensus_timestamp >= value (e.g. "1234567890.000000001"). */
  timestamp?: string;
};

function assertValidTopicId(topicId: string): void {
  assertValidEntityId(topicId, "topic ID");
}

function buildTopicMessagesPath(topicId: string, options: FetchTopicMessagesOptions): string {
  const { limit = DEFAULT_LIMIT, order = "desc", sequenceNumber, timestamp } = options;
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(Math.max(1, limit), MAX_LIMIT)));
  params.set("order", order);
  if (sequenceNumber != null) params.set("sequencenumber", String(sequenceNumber));
  if (timestamp) params.set("timestamp", timestamp);
  return `/api/v1/topics/${topicId}/messages?${params.toString()}`;
}

/**
 * Fetch topic messages from the Mirror Node REST API.
 * @param topicId - HCS topic ID (e.g. "0.0.12345")
 * @param options - limit, order, optional sequence/timestamp filters, optional `fetch` init / signal
 */
export async function fetchTopicMessages(
  topicId: string,
  options: FetchTopicMessagesOptions = {},
): Promise<TopicMessagesResponse> {
  assertValidTopicId(topicId);

  const { network, fetchOptions, signal } = options;
  const data = await mirrorRequest<TopicMessagesResponse>(buildTopicMessagesPath(topicId, options), {
    network,
    fetchOptions,
    signal,
  });

  return {
    messages: data.messages ?? [],
    links: data.links ?? { next: null },
  };
}

export function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function parseJsonOrUndefined(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export type DecodedTopicMessage = MirrorTopicMessage & {
  /** UTF-8 text of the payload; empty when the base64 could not be decoded. */
  text: string;
  /** Parsed payload when the text is valid JSON, otherwise `undefined`. */
  json: unknown;
};

/** Never throws: an undecodable payload yields empty text and no JSON. */
export function decodeTopicMessage(message: MirrorTopicMessage): DecodedTopicMessage {
  let text = "";
  try {
    text = decodeBase64Utf8(message.message);
  } catch {
    text = "";
  }
  return { ...message, text, json: text ? parseJsonOrUndefined(text) : undefined };
}

export async function fetchDecodedTopicMessages(
  topicId: string,
  options: FetchTopicMessagesOptions = {},
): Promise<DecodedTopicMessage[]> {
  const { messages } = await fetchTopicMessages(topicId, options);
  return messages.map(decodeTopicMessage);
}
