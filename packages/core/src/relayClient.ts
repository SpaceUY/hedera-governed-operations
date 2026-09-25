/**
 * The viem client every read through the Hedera JSON-RPC relay goes through.
 *
 * Reads that need no operator key still cannot use a `ContractCallQuery` from the browser, so they
 * go through the relay's `eth_call`. Each caller used to build its own `createPublicClient({
 * transport: http(url) })`, which meant four copies of a retry policy nobody had chosen: viem
 * defaults to three retries with exponential backoff, so a relay that answers 502 is asked four
 * times over about a second before the failure surfaces.
 *
 * A second of that is the wrong trade here, because the callers already sit under React Query with
 * `retry: false` and a 5 s poll: a relay that stays down is asked again by the next poll whatever
 * this does, so the only thing three retries buy is holding the read open. One retry absorbs a
 * single blip and anything longer surfaces as unreachable, which is the degradation the inbox and
 * the registry cross-check are built around.
 */
import { type PublicClient, createPublicClient, http } from "viem";

/**
 * Two attempts, roughly 150 ms. Written down rather than inherited: viem's default of 3 is a
 * sensible choice for a one-shot read and the wrong one under a poll.
 */
export const RELAY_RETRY_COUNT = 1;

export function createRelayClient(rpcUrl: string): PublicClient {
  return createPublicClient({ transport: http(rpcUrl, { retryCount: RELAY_RETRY_COUNT }) });
}
