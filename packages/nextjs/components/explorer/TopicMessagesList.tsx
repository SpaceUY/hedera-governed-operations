"use client";

import type { DecodedTopicMessage } from "@sh/core/mirror";
import { isValidEntityId, mirrorTimestampToDate } from "@sh/core/mirror";
import { useTopicMessagesFeed } from "~~/hooks/mirror";

const FEED_LIMIT = 20;

function renderPayload(message: DecodedTopicMessage) {
  if (message.json !== undefined) {
    return <pre className="text-xs whitespace-pre-wrap break-words m-0">{JSON.stringify(message.json, null, 2)}</pre>;
  }
  return <p className="whitespace-pre-wrap break-words m-0">{message.text || "(undecodable payload)"}</p>;
}

type TopicMessagesListProps = {
  topicId: string;
};

export function TopicMessagesList({ topicId }: TopicMessagesListProps) {
  const { data, error, isSuccess } = useTopicMessagesFeed(topicId, { limit: FEED_LIMIT });

  if (!topicId) {
    return <p className="text-sm text-base-content/60">Paste a topic id to see its latest messages.</p>;
  }

  if (!isValidEntityId(topicId)) {
    return <p className="text-sm text-warning">Expected an id like 0.0.12345.</p>;
  }

  if (error) {
    return <p className="text-sm text-error">{error.message}</p>;
  }

  if (!isSuccess) {
    return <span className="loading loading-spinner loading-sm" aria-label="Loading messages" />;
  }

  if (data.length === 0) {
    return <p className="text-sm text-base-content/60">No messages on this topic yet.</p>;
  }

  return (
    <ul className="space-y-3 list-none p-0 m-0">
      {data.map(message => (
        <li key={message.sequence_number} className="rounded-lg border border-base-300 bg-base-200/40 p-3 text-sm">
          <div className="mb-2 flex flex-wrap gap-3 text-xs text-base-content/60">
            <span>#{message.sequence_number}</span>
            <time dateTime={message.consensus_timestamp}>
              {mirrorTimestampToDate(message.consensus_timestamp)?.toLocaleString() ?? message.consensus_timestamp}
            </time>
            <span className={`badge badge-xs ${message.json !== undefined ? "badge-info" : "badge-ghost"}`}>
              {message.json !== undefined ? "json" : "text"}
            </span>
          </div>
          {renderPayload(message)}
        </li>
      ))}
    </ul>
  );
}
