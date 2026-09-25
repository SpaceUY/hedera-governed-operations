import { isMirrorNotFound } from "~~/services/mirror";

/** Mirror typically indexes a transaction 3–20 s after consensus; these add up to ~21 s. */
export const MIRROR_INDEXING_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 3000, 4000, 5000, 6000];

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Re-runs `read` until it returns a value, treating a 404 and a `null` result alike as "not indexed
 * yet". Any other error — a definite on-chain failure included — is rethrown at once. Returns
 * `null` once every attempt is spent, so the caller can say which transaction it was waiting on.
 */
export async function waitForMirrorIndexing<T>(
  read: () => Promise<T | null>,
  delaysMs: readonly number[],
): Promise<T | null> {
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      const value = await read();
      if (value != null) return value;
    } catch (error) {
      if (!isMirrorNotFound(error)) throw error;
    }
    if (attempt < delaysMs.length) await sleep(delaysMs[attempt]);
  }
  return null;
}
