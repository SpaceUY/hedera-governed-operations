/**
 * The viem client every read through the Hedera JSON-RPC relay goes through.
 *
 * Reads that need no operator key still cannot use a `ContractCallQuery` from the browser, so they
 * go through the relay's `eth_call`. Each caller used to build its own `createPublicClient({
 * transport: http(url) })`, which meant four copies of a retry policy nobody had chosen: viem
 * defaults to three retries with exponential backoff, so a relay that answers 502 is asked four
 * times over about a second before the failure surfaces.
 *
 * That default is kept here deliberately rather than by omission, in one place, because the callers
 * sit under React Query — `retry: false` with a 5 s poll — and the layering is worth seeing: a
 * transient blip is absorbed here, and anything longer is reported as unreachable and retried by the
 * next poll rather than held open.
 */
import { type PublicClient, createPublicClient, http } from "viem";

/** viem's own default, written down so changing it is a decision and not an upgrade's side effect. */
export const RELAY_RETRY_COUNT = 3;

export function createRelayClient(rpcUrl: string): PublicClient {
  return createPublicClient({ transport: http(rpcUrl, { retryCount: RELAY_RETRY_COUNT }) });
}
