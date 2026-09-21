import { isMirrorNotFound } from "~~/services/mirror";

/** Mirror lags consensus by seconds; this is how often pending entities are re-read. */
export const DEFAULT_PENDING_POLL_MS = 5_000;

export type MirrorQueryOptions = {
  /** Mirror network name; defaults to `NEXT_PUBLIC_HEDERA_NETWORK` or testnet. */
  network?: string;
  enabled?: boolean;
  /** Interval while the entity is pending or not yet indexed (404). */
  pollIntervalMs?: number;
};

export function getDefaultMirrorNetwork(): string {
  return process.env.NEXT_PUBLIC_HEDERA_NETWORK ?? "testnet";
}

export function mirrorQueryKey(network: string, ...parts: string[]): string[] {
  return ["mirror", network, ...parts];
}

type PendingQuerySnapshot = {
  /** `undefined` until the first successful read. */
  isSettled: boolean | undefined;
  error: unknown;
};

/**
 * Polling decision shared by the schedule/transaction hooks:
 * keep polling while unsettled or while Mirror has not indexed the entity yet (404),
 * stop on any other error or once settled.
 */
export function resolvePendingRefetchInterval(snapshot: PendingQuerySnapshot, intervalMs: number): number | false {
  if (snapshot.isSettled === false) return intervalMs;
  if (snapshot.isSettled === undefined && isMirrorNotFound(snapshot.error)) return intervalMs;
  return false;
}
