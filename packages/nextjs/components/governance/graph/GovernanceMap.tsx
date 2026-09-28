"use client";

import { GovernanceGraph } from "./GovernanceGraph";
import { MAP_LABELS } from "./copy";
import { useComposedMap } from "./useComposedMap";
import type { GovernanceConfig } from "~~/config/governanceConfig";

export type GovernanceMapProps = {
  /** Resolved once by the host's setup guard (`resolveGovernanceConfig`). */
  config: GovernanceConfig;
};

/**
 * The governance map for the configured deployment: the council and the proposers as the ledger
 * has them, the trust chain down to the contracts, and the accounts a pending proposal would pay.
 * It reads through the same queries as the rest of the screen, so it never polls on its own, and
 * names the seat the connected account holds "You". A hand-composed layout comes from the host's
 * `MapDecoratorProvider`; without one every node is placed by role (`autoLayout`).
 */
export function GovernanceMap({ config }: GovernanceMapProps) {
  const { composed, council } = useComposedMap(config);

  if (council.error) {
    return (
      <p role="alert" className="alert alert-warning m-4">
        {MAP_LABELS.unavailable}
      </p>
    );
  }
  if (!council.data || !composed) {
    return (
      <p className="flex h-full items-center justify-center gap-2 text-sm text-base-content/70">
        <span className="loading loading-spinner loading-sm" aria-hidden="true" />
        {MAP_LABELS.loading}
      </p>
    );
  }
  return <GovernanceGraph {...composed} council={council.data.key} />;
}
