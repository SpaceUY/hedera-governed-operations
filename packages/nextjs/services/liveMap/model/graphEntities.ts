/**
 * The configured part of the governance graph: the contracts the executor calls, the token one of
 * them administers, and the DEX router the swap adapter reaches. `graph.ts` adds the rest — the
 * council, the proposers, the governance account and the executor — from the ledger.
 *
 * Every entity is named by what the deployment recorded. A contract deployed through the JSON-RPC
 * relay may have no native id resolved yet; it is then named by its EVM address, which the graph
 * compares in every spelling, rather than left off the map or crashing it.
 */
import { GOVERNANCE_ACCOUNT_NODE_ID, type GraphEntity } from "./graph";
import { GOVERNANCE_CONTRACTS, type GovernanceConfig, findDeployment } from "~~/config/governanceConfig";
import { SAUCERSWAP_V2_CONFIG } from "~~/services/swap/saucerSwapConfig";

/** Node ids of the configured entities, stable across polls so a layout can place them. */
export const MAP_ENTITY_IDS = {
  vault: "vault",
  tokenAdmin: "tokenAdmin",
  swapAdapter: "swapAdapter",
  token: "token",
  router: "router",
} as const;

export type DeployedEntity = { address: string; hederaContractId?: string };

export type GovernanceEntitySources = {
  vault: DeployedEntity;
  tokenAdmin: DeployedEntity | null;
  swapAdapter: DeployedEntity | null;
  tokenId: string;
  routerId: string;
};

const contractRef = ({ address, hederaContractId }: DeployedEntity) => ({
  ref: hederaContractId ?? address,
  evmAddress: address,
});

/**
 * The entities for one deployment. A contract that is not deployed is left out, and so is its link;
 * the swap adapter declares exactly one authority link, to the router, which is how the graph knows
 * the router is what a swap reaches next.
 */
export function governanceEntities(sources: GovernanceEntitySources): GraphEntity[] {
  const { vault, tokenAdmin, swapAdapter, tokenId, routerId } = sources;
  const entities: GraphEntity[] = [
    {
      id: MAP_ENTITY_IDS.vault,
      role: "target",
      ...contractRef(vault),
      // The vault's reserve is part of what the treasury governs.
      links: [{ to: GOVERNANCE_ACCOUNT_NODE_ID, kind: "funds" }],
    },
  ];
  if (tokenAdmin) {
    entities.push({
      id: MAP_ENTITY_IDS.tokenAdmin,
      role: "target",
      ...contractRef(tokenAdmin),
      links: [{ to: MAP_ENTITY_IDS.token, kind: "authority" }],
    });
  }
  if (swapAdapter) {
    entities.push({
      id: MAP_ENTITY_IDS.swapAdapter,
      role: "target",
      ...contractRef(swapAdapter),
      links: [{ to: MAP_ENTITY_IDS.router, kind: "authority" }],
    });
  }
  entities.push(
    { id: MAP_ENTITY_IDS.token, role: "token", ref: tokenId },
    // The router settles a swap's output straight to the treasury.
    {
      id: MAP_ENTITY_IDS.router,
      role: "external",
      ref: routerId,
      links: [{ to: GOVERNANCE_ACCOUNT_NODE_ID, kind: "funds" }],
    },
  );
  return entities;
}

/** `governanceEntities` for the configured deployment on one chain. */
export function governanceEntitiesOf(
  config: Pick<GovernanceConfig, "network" | "demoTokenId"> & { vault: DeployedEntity },
  chainId: number,
): GraphEntity[] {
  return governanceEntities({
    vault: config.vault,
    tokenAdmin: findDeployment(chainId, GOVERNANCE_CONTRACTS.tokenAdmin),
    swapAdapter: findDeployment(chainId, GOVERNANCE_CONTRACTS.swapAdapter),
    tokenId: config.demoTokenId,
    routerId: SAUCERSWAP_V2_CONFIG[config.network].swapRouter,
  });
}
