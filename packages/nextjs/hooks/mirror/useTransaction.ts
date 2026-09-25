"use client";

import {
  DEFAULT_PENDING_POLL_MS,
  type MirrorQueryOptions,
  getDefaultMirrorNetwork,
  mirrorQueryKey,
  resolvePendingRefetchInterval,
} from "./mirrorQuery";
import { type MirrorTransaction, fetchTransaction, isTransactionId } from "@sh/core/mirror";
import { useQuery } from "@tanstack/react-query";

function hasRows(rows: MirrorTransaction[] | undefined): boolean | undefined {
  if (rows === undefined) return undefined;
  return rows.length > 0;
}

/**
 * Reads every Mirror row recorded for a transaction id (parent and scheduled/child rows).
 * Accepts `0.0.x@sec.nanos` or `0.0.x-sec-nanos`; polls until Mirror has indexed the id.
 */
export function useTransaction(transactionId: string | null | undefined, options: MirrorQueryOptions = {}) {
  const network = options.network ?? getDefaultMirrorNetwork();
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_PENDING_POLL_MS;
  const id = transactionId?.trim() ?? "";

  return useQuery<MirrorTransaction[], Error>({
    queryKey: mirrorQueryKey(network, "transaction", id),
    queryFn: () => fetchTransaction(id, { network }),
    enabled: (options.enabled ?? true) && isTransactionId(id),
    retry: false,
    refetchInterval: query =>
      resolvePendingRefetchInterval({ isSettled: hasRows(query.state.data), error: query.state.error }, pollIntervalMs),
  });
}
