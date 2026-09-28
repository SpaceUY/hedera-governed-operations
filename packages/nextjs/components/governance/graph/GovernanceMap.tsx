"use client";

import { useMemo } from "react";
import { GovernanceGraph } from "./GovernanceGraph";
import { type MapDecorator, composeMap } from "./mapModel";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { useProposals } from "~~/hooks/mirror/useProposals";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { governanceEntitiesOf } from "~~/services/governance/graphEntities";
import { MAP_LABELS } from "~~/services/governance/proposalLabels";

export type GovernanceMapProps = {
  /** Resolved once by the host's setup guard (`resolveGovernanceConfig`). */
  config: GovernanceConfig;
  /** A hand-composed layout; without one the map places every node by role (`autoLayout`). */
  decorate?: MapDecorator;
};

/**
 * The governance map for the configured deployment: the council and the proposers as the ledger
 * has them, the trust chain down to the contracts, and the accounts a pending proposal would pay.
 * It reads through the same queries as the rest of the screen, so it never polls on its own.
 */
export function GovernanceMap({ config, decorate }: GovernanceMapProps) {
  const { targetNetwork } = useTargetNetwork();
  const { governanceAccountId, network, executor } = config;
  const { inbox, council } = useProposals({
    governanceAccountId,
    executorContractId: executor.hederaContractId,
    network,
  });
  const entities = useMemo(() => governanceEntitiesOf(config, targetNetwork.id), [config, targetNetwork.id]);

  const composed = useMemo(() => {
    if (!council.data) return null;
    return composeMap(
      {
        governanceAccountId,
        executor: { ref: executor.hederaContractId, evmAddress: executor.address },
        council: council.data.key,
        proposers: council.data.proposers,
        entities,
        proposals: inbox.data?.proposals ?? [],
      },
      decorate,
    );
  }, [council.data, inbox.data, entities, governanceAccountId, executor, decorate]);

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
