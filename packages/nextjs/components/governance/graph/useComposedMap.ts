"use client";

import { useMemo } from "react";
import { useMapDecorator } from "./MapDecoratorContext";
import { composeMap } from "./mapModel";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { useProposals } from "~~/hooks/mirror/useProposals";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { governanceEntitiesOf } from "~~/services/liveMap/model/graphEntities";

/**
 * The map as composed for the configured deployment — its graph, names and captions — from the same
 * queries the rest of the screen reads, so it never polls on its own. The map draws it; the rail reads
 * its names, which is how a council member or a route step is called the same thing in both places.
 */
export function useComposedMap(config: GovernanceConfig) {
  const decorate = useMapDecorator();
  const { targetNetwork } = useTargetNetwork();
  const { accountId: viewerAccountId } = useHederaSigner();
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
      viewerAccountId,
    );
  }, [council.data, inbox.data, entities, governanceAccountId, executor, decorate, viewerAccountId]);

  return { composed, council };
}
