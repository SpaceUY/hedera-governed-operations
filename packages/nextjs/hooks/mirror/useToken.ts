"use client";

import { type MirrorQueryOptions, getDefaultMirrorNetwork, mirrorQueryKey } from "./mirrorQuery";
import { useQuery } from "@tanstack/react-query";
import { type MirrorToken, fetchToken, isValidEntityId, parseTokenDecimals } from "~~/services/mirror";

export type TokenQueryData = {
  token: MirrorToken;
  /** Already a number here, so a form can hand it straight to `parseUnits`. */
  decimals: number;
};

type TokenQueryOptions = Omit<MirrorQueryOptions, "pollIntervalMs">;

/** Reads a token's metadata and pause state. Not polled: only a passed proposal changes them. */
export function useToken(tokenId: string | null | undefined, options: TokenQueryOptions = {}) {
  const network = options.network ?? getDefaultMirrorNetwork();
  const id = tokenId?.trim() ?? "";

  return useQuery<TokenQueryData, Error>({
    queryKey: mirrorQueryKey(network, "token", id),
    queryFn: async () => {
      const token = await fetchToken(id, { network });
      return { token, decimals: parseTokenDecimals(token.decimals) };
    },
    enabled: (options.enabled ?? true) && isValidEntityId(id),
    retry: false,
  });
}
