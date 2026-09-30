"use client";

import { useMemo } from "react";
import { type GovernanceConfig, getCoSigningAgentAccountId } from "~~/config/governanceConfig";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { useCoSigningAgent } from "~~/hooks/useCoSigningAgent";
import type { GraphEntity } from "~~/services/liveMap/model/graph";
import { governanceEntitiesOf } from "~~/services/liveMap/model/graphEntities";

/**
 * What the map knows outside the ledger reads, the same for the drawn map and for its preview: the
 * configured contracts it draws (`entities`), and the co-signing agent the app was told about — its
 * account as configured, so a payment to it is named for the agent before its key is read, and the
 * seat its key would hold, null until that key is read.
 */
export type MapEnvironment = {
  entities: GraphEntity[];
  agentAccountId: string | null;
  agentSeat: string | null;
};

export function useMapEnvironment(config: GovernanceConfig): MapEnvironment {
  const { targetNetwork } = useTargetNetwork();
  const agentSeat = useCoSigningAgent(config.network)?.seat ?? null;
  const agentAccountId = getCoSigningAgentAccountId();
  const entities = useMemo(() => governanceEntitiesOf(config, targetNetwork.id), [config, targetNetwork.id]);
  return useMemo(() => ({ entities, agentAccountId, agentSeat }), [entities, agentAccountId, agentSeat]);
}
