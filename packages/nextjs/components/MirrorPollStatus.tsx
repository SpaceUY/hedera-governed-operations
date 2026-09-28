"use client";

import { useEffect, useState } from "react";
import { useInboxUpdatedAt } from "~~/hooks/mirror/useInboxUpdatedAt";
import { SETTLED_INBOX_POLL_MS } from "~~/hooks/mirror/useProposals";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { getHederaNetworkNameFromChainId } from "~~/utils/scaffold-hbar/networks";

const TICK_MS = 1_000;

/** Past two settled-inbox polls with no read, the screen is showing a world that may have moved on. */
const STALE_AFTER_MS = 2 * SETTLED_INBOX_POLL_MS;

/** "polled 4s ago", in whole seconds under a minute and whole minutes after that. */
export function polledAgoLabel(updatedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - updatedAt) / 1_000));
  if (seconds < 60) return `polled ${seconds}s ago`;
  return `polled ${Math.floor(seconds / 60)}m ago`;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * How fresh the proposal inbox is, as the Mirror Node last answered it. A leaf of its own so the
 * one-second tick re-renders this line and nothing else; hidden until the inbox has been read once.
 */
export const MirrorPollStatus = () => {
  const { targetNetwork } = useTargetNetwork();
  const updatedAt = useInboxUpdatedAt(getHederaNetworkNameFromChainId(targetNetwork.id));
  const now = useNow(TICK_MS);
  if (updatedAt === 0) return null;

  const isStale = now - updatedAt > STALE_AFTER_MS;
  return (
    <span className="flex items-center gap-2 text-xs text-base-content/60 whitespace-nowrap">
      <span aria-hidden className={`h-2 w-2 rounded-full ${isStale ? "bg-warning" : "bg-success"}`} />
      Mirror Node · {polledAgoLabel(updatedAt, now)}
    </span>
  );
};
