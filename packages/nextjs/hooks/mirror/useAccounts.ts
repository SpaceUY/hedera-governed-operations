"use client";

import { type MirrorQueryOptions, getDefaultMirrorNetwork, mirrorQueryKey } from "./mirrorQuery";
import { type MirrorAccount, fetchAccount, isMirrorEntityRef } from "@sh/core/mirror";
import { type QueryObserverResult, useQueries } from "@tanstack/react-query";

type AccountQueryOptions = Omit<MirrorQueryOptions, "pollIntervalMs">;

/** One of the accounts `useAccounts` reads, as the form asking for it needs it. */
export type AccountListRead = { account: MirrorAccount | undefined; error: Error | null; isLoading: boolean };

// Module-level so React Query keeps the combined list's identity while no read changes.
const combineAccountReads = (results: QueryObserverResult<MirrorAccount, Error>[]): AccountListRead[] =>
  results.map(({ data, error, isLoading }) => ({ account: data, error, isLoading }));

/**
 * `useAccount` for a list whose length changes, such as the accounts a council change adds. Each read
 * uses `useAccount`'s query key, so the two share one cache. The result keeps its identity until one of
 * the reads changes, so an effect can depend on it.
 */
export function useAccounts(accountIdsOrEvm: string[], options: AccountQueryOptions = {}): AccountListRead[] {
  const network = options.network ?? getDefaultMirrorNetwork();
  const enabled = options.enabled ?? true;
  return useQueries({
    queries: accountIdsOrEvm.map(input => {
      const id = input.trim();
      return {
        queryKey: mirrorQueryKey(network, "account", id),
        queryFn: () => fetchAccount(id, { network }),
        enabled: enabled && isMirrorEntityRef(id),
        retry: false,
      };
    }),
    combine: combineAccountReads,
  });
}
