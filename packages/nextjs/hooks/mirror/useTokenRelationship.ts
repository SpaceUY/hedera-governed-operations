"use client";

import { type MirrorQueryOptions, getDefaultMirrorNetwork, mirrorQueryKey } from "./mirrorQuery";
import { useQuery } from "@tanstack/react-query";
import { type MirrorTokenRelationship, fetchTokenRelationship, isValidEntityId } from "~~/services/mirror";

type TokenRelationshipQueryOptions = Omit<MirrorQueryOptions, "pollIntervalMs">;

/**
 * Reads how one account stands with one token, which is what a freeze or unfreeze
 * proposal acts on. `null` data means the account never associated the token — a
 * successful read, and the reason freezing it would be refused.
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
    enabled: (options.enabled ?? true) && isValidEntityId(account) && isValidEntityId(token),
    retry: false,
  });
}
