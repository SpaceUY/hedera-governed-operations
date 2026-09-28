"use client";

import { type MirrorQueryOptions, getDefaultMirrorNetwork, mirrorQueryKey } from "./mirrorQuery";
import { type MirrorAccount, fetchAccount, isMirrorEntityRef } from "@sh/core/mirror";
import { type QueryObserverResult, useQueries, useQuery } from "@tanstack/react-query";

type AccountQueryOptions = Omit<MirrorQueryOptions, "pollIntervalMs">;

function accountQuery(id: string, network: string, enabled: boolean) {
  return {
    queryKey: mirrorQueryKey(network, "account", id),
    queryFn: () => fetchAccount(id, { network }),
    enabled: enabled && isMirrorEntityRef(id),
    retry: false,
  };
}

/** Reads an account by `0.0.x` id or EVM address. Not polled: account state changes are not awaited here. */
export function useAccount(accountIdOrEvm: string | null | undefined, options: AccountQueryOptions = {}) {
  const network = options.network ?? getDefaultMirrorNetwork();
  return useQuery<MirrorAccount, Error>(accountQuery(accountIdOrEvm?.trim() ?? "", network, options.enabled ?? true));
}

/** One of the accounts `useAccounts` reads, as the form asking for it needs it. */
export type AccountListRead = { account: MirrorAccount | undefined; error: Error | null; isLoading: boolean };

// Module-level so React Query keeps the combined list's identity while no read changes.
const combineAccountReads = (results: QueryObserverResult<MirrorAccount, Error>[]): AccountListRead[] =>
  results.map(({ data, error, isLoading }) => ({ account: data, error, isLoading }));

/**
 * `useAccount` for a list whose length changes, such as the members of a proposed council. The result
 * keeps its identity until one of the reads changes, so an effect can depend on it.
 */
export function useAccounts(accountIdsOrEvm: string[], options: AccountQueryOptions = {}): AccountListRead[] {
  const network = options.network ?? getDefaultMirrorNetwork();
  const enabled = options.enabled ?? true;
  return useQueries({
    queries: accountIdsOrEvm.map(id => accountQuery(id.trim(), network, enabled)),
    combine: combineAccountReads,
  });
}
