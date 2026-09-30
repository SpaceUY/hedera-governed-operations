"use client";

import { useMemo } from "react";
import { useMapDecorator } from "./MapDecoratorContext";
import { type ComposedMap, composeMap } from "./mapModel";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { useProposals } from "~~/hooks/mirror/useProposals";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { useCoSigningAgent } from "~~/hooks/useCoSigningAgent";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import type { GraphSnapshot } from "~~/services/liveMap/model/graph";
import { governanceEntitiesOf } from "~~/services/liveMap/model/graphEntities";

/** What of a read the map is drawn from: who sits on the council, who proposes, what is proposed. */
export type MapWorld = Pick<GraphSnapshot, "council" | "proposers" | "proposals">;

/**
 * The map as composed for the configured deployment — its graph, names and captions — from `world`,
 * or null while there is none. The one place the map is composed: the map pane passes the world it
 * holds while a sequence plays, the rail the latest read (`useLatestComposedMap`), so a council member
 * or a route step is called the same thing in both places.
 */
export function useComposedMap(config: GovernanceConfig, world: MapWorld | null): ComposedMap | null {
  const decorate = useMapDecorator();
  const { targetNetwork } = useTargetNetwork();
  const { accountId: viewerAccountId } = useHederaSigner();
  const { governanceAccountId, executor, network } = config;
  const agentSeat = useCoSigningAgent(network)?.seat;
  const entities = useMemo(() => governanceEntitiesOf(config, targetNetwork.id), [config, targetNetwork.id]);

  return useMemo(() => {
    if (!world) return null;
    return composeMap(
      {
        governanceAccountId,
        executor: { ref: executor.hederaContractId, evmAddress: executor.address },
        council: world.council,
        proposers: world.proposers,
        entities,
        proposals: world.proposals,
      },
      decorate,
      { viewerAccountId, agentSeat },
    );
  }, [world, entities, governanceAccountId, executor, decorate, viewerAccountId, agentSeat]);
}

/**
 * The map as the latest read has it, from the same queries the rest of the screen reads, so it never
 * polls on its own. The rail reads its names.
 */
export function useLatestComposedMap(config: GovernanceConfig) {
  const { governanceAccountId, network, executor } = config;
  const { inbox, council } = useProposals({
    governanceAccountId,
    executorContractId: executor.hederaContractId,
    network,
  });
  const world = useMemo<MapWorld | null>(
    () =>
      council.data
        ? { council: council.data.key, proposers: council.data.proposers, proposals: inbox.data?.proposals ?? [] }
        : null,
    [council.data, inbox.data],
  );
  const composed = useComposedMap(config, world);

  return { composed, council };
}
