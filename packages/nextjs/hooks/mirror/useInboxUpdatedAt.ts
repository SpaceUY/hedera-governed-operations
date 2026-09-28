"use client";

import { useCallback, useSyncExternalStore } from "react";
import { proposalInboxQueryKey } from "./useProposals";
import { useQueryClient } from "@tanstack/react-query";

const NEVER = 0;

/**
 * When the proposal inbox on `network` was last read from the Mirror Node, in ms since the epoch,
 * or 0 before any read. It watches the query cache instead of the query, so a component outside the
 * governance screens (the header) can show it without knowing the council, and it re-renders only
 * when the timestamp itself changes.
 */
export function useInboxUpdatedAt(network: string): number {
  const queryCache = useQueryClient().getQueryCache();
  const subscribe = useCallback((onChange: () => void) => queryCache.subscribe(onChange), [queryCache]);
  const readUpdatedAt = useCallback(
    () =>
      queryCache
        .findAll({ queryKey: proposalInboxQueryKey(network) })
        .reduce((latest, query) => Math.max(latest, query.state.dataUpdatedAt), NEVER),
    [queryCache, network],
  );
  return useSyncExternalStore(subscribe, readUpdatedAt, () => NEVER);
}
