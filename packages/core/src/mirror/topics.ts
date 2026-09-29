import {
  DEFAULT_MAX_PAGES,
  type MirrorPage,
  type MirrorPaginateOptions,
  type MirrorRequestOptions,
  assertValidEntityId,
  mirrorRequest,
} from "./client";
import type { MirrorKey } from "./schedules";

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

/** The topic itself from GET /api/v1/topics/{id}; only the fields that say who may write to it. */
export type MirrorTopic = {
  topic_id: string;
  memo: string;
  deleted: boolean;
  /** Null means anyone can submit a message. A topic whose contents are evidence needs one. */
  submit_key: MirrorKey | null;
  /** Null means the topic is immutable: no submit key can be added to it afterwards. */
  admin_key: MirrorKey | null;
};

function assertValidTopicId(topicId: string): void {
  assertValidEntityId(topicId, "topic ID");
}

export async function fetchTopic(topicId: string, options: MirrorRequestOptions = {}): Promise<MirrorTopic> {
  assertValidTopicId(topicId);
  return mirrorRequest<MirrorTopic>(`/api/v1/topics/${topicId}`, options);
}

/** Whether the network refuses a message from anyone but the holder of the topic's submit key. */
export function hasSubmitKey(topic: MirrorTopic): boolean {
  return Boolean(topic.submit_key?.key);
}

/** Why a topic's contents cannot count as evidence: it is gone, or anyone can write to it. */
export type UnsignedTopicReason = "deleted" | "noSubmitKey";

/**
 * What `assertTopicIsSigned` throws, so a reader can tell a topic that answered "not signed" from
 * one that could not be read at all.
 */
export class UnsignedTopicError extends Error {
  override readonly name = "UnsignedTopicError";

  constructor(
    readonly topicId: string,
    readonly reason: UnsignedTopicReason,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The check that has to run before a topic's contents count as evidence: a topic with no submit key
 * takes a message from anyone, so everything on it is an unsigned claim. It throws rather than
 * returning a verdict because it answers a question about the configuration, not about one message —
 * a service pointed at an open topic should refuse to start, not refuse one record at a time.
 *
 * `subject` names what the topic is for, so the refusal reads as the sentence whoever configured it
 * needs: "release topic 0.0.x has no submit key".
 */
export async function assertTopicIsSigned(
  topicId: string,
  subject: string,
  options: MirrorRequestOptions = {},
): Promise<MirrorTopic> {
  const topic = await fetchTopic(topicId, options);
  if (topic.deleted) throw new UnsignedTopicError(topicId, "deleted", `${subject} topic ${topicId} is deleted`);
  if (!hasSubmitKey(topic)) {
    throw new UnsignedTopicError(
      topicId,
      "noSubmitKey",
      `${subject} topic ${topicId} has no submit key, so anyone can publish on it: ` +
        "create one with a submit key (yarn setup does) and point the configuration at that topic instead",
    );
  }
  return topic;
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

export type PagedTopicMessages = {
  messages: DecodedTopicMessage[];
  /** True when `maxPages` ran out with more history behind it, so the answer is a window, not the topic. */
  truncated: boolean;
};

/**
 * The same read, following `links.next` instead of stopping at one page.
 *
 * A caller that searches the topic for something — rather than showing the last page of a feed —
 * has to know whether it ran out of pages before it ran out of topic, because "not found in the
 * window I read" and "not on the topic" are different answers to give a user.
 */
export async function fetchDecodedTopicMessagePages(
  topicId: string,
  options: FetchTopicMessagesOptions & MirrorPaginateOptions = {},
): Promise<PagedTopicMessages> {
  assertValidTopicId(topicId);
  const { maxPages = DEFAULT_MAX_PAGES, fetchOptions, network, signal, ...messageOptions } = options;
  const requestOptions: MirrorRequestOptions = { fetchOptions, network, signal };

  const messages: DecodedTopicMessage[] = [];
  let nextPath: string | null = buildTopicMessagesPath(topicId, { ...messageOptions, limit: MAX_LIMIT });

  for (let page = 0; page < maxPages && nextPath; page += 1) {
    const response: TopicMessagesResponse = await mirrorRequest<TopicMessagesResponse>(nextPath, requestOptions);
    for (const message of response.messages ?? []) messages.push(decodeTopicMessage(message));
    nextPath = response.links?.next ?? null;
  }

  // `nextPath` still set is the network saying there is more behind what was read.
  return { messages, truncated: nextPath !== null };
}
