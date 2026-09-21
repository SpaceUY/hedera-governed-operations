"use client";

import { type MirrorQueryOptions, getDefaultMirrorNetwork, mirrorQueryKey } from "./mirrorQuery";
import { useQuery } from "@tanstack/react-query";
import { type MirrorAccount, fetchAccount, isValidEntityId } from "~~/services/mirror";
import { isEvmAddress } from "~~/utils/scaffold-hbar/identity";

type AccountQueryOptions = Omit<MirrorQueryOptions, "pollIntervalMs">;

/** Reads an account by `0.0.x` id or EVM address. Not polled: account state changes are not awaited here. */
export function useAccount(accountIdOrEvm: string | null | undefined, options: AccountQueryOptions = {}) {
  const network = options.network ?? getDefaultMirrorNetwork();
  const id = accountIdOrEvm?.trim() ?? "";

  return useQuery<MirrorAccount, Error>({
    queryKey: mirrorQueryKey(network, "account", id),
    queryFn: () => fetchAccount(id, { network }),
    enabled: (options.enabled ?? true) && (isValidEntityId(id) || isEvmAddress(id)),
    retry: false,
  });
}
