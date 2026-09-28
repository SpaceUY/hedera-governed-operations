"use client";

import { type MirrorQueryOptions, getDefaultMirrorNetwork, mirrorQueryKey } from "./mirrorQuery";
import { type MirrorTokenRelationship, fetchTokenRelationship, isMirrorEntityRef } from "@sh/core/mirror";
import { useQuery } from "@tanstack/react-query";

type TokenRelationshipQueryOptions = Omit<MirrorQueryOptions, "pollIntervalMs">;

/**
 * Reads how one account stands with one token, which is what a freeze or unfreeze
 * proposal acts on. Either id may be a `0.0.x` id or the EVM address a decoded
 * proposal carries.
 *
 * `null` data is a successful read with no relationship to show, and the reason
 * freezing that account would be refused.
 */
export function useTokenRelationship(
  accountId: string | null | undefined,
  tokenId: string | null | undefined,
  options: TokenRelationshipQueryOptions = {},
) {
  const network = options.network ?? getDefaultMirrorNetwork();
  const account = accountId?.trim() ?? "";
  const token = tokenId?.trim() ?? "";

  return useQuery<MirrorTokenRelationship | null, Error>({
    queryKey: mirrorQueryKey(network, "token-relationship", account, token),
    queryFn: () => fetchTokenRelationship(account, token, { network }),
    enabled: (options.enabled ?? true) && isMirrorEntityRef(account) && isMirrorEntityRef(token),
    retry: false,
  });
}
