"use client";

import { useMemo } from "react";
import { AccountNode } from "./AccountNode";
import { ContractNode } from "./ContractNode";
import { GraphEdge } from "./GraphEdge";
import { Legend } from "./Legend";
import type { MapItemRef } from "./MapItem";
import { TokenNode } from "./TokenNode";
import { TreasuryNode } from "./TreasuryNode";
import { routeOnMap } from "./geometry";
import { type GhostNode, readingOrder } from "./mapModel";
import type { NodeProps } from "./nodeProps";
import { useRovingFocus } from "./useRovingFocus";
import type { CouncilKey } from "@sh/core/governance/council";
import {
  type EdgePhase,
  type GovernanceGraph as Graph,
  type GraphNode,
  externalNodeId,
} from "~~/services/governance/graph";
import {
  MAP_LABELS,
  MAP_NODE_CAPTIONS,
  councilRuleLabel,
  mapEdgeCaption,
  mapEdgeLabel,
} from "~~/services/governance/proposalLabels";

export type GovernanceGraphProps = {
  graph: Graph;
  council: CouncilKey;
  captions?: Partial<Record<string, string>>;
  ghosts?: GhostNode[];
  /** Phase per edge id; every other edge is at rest. An `intent` edge is only drawn outside rest. */
  phases?: Partial<Record<string, EdgePhase>>;
  /** Council members who signed the proposal being shown, for the treasury's ring. */
  signed?: number;
  onActivate?: (item: MapItemRef) => void;
};

/**
 * The governance graph drawn as SVG: real text, one Tab stop, arrow keys between nodes and edges.
 * Edges are drawn first so the nodes' opaque plates sit on top of their ends. The legend takes its
 * own row under the drawing rather than floating over it: the drawing scales with the pane and the
 * legend does not, so no reserved band of viewBox units keeps a layout's lowest nodes out from under it.
 */
export function GovernanceGraph({
  graph,
  council,
  captions = {},
  ghosts = [],
  phases = {},
  signed = 0,
  onActivate,
}: GovernanceGraphProps) {
  const nodesById = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes]);
  const edges = graph.edges.filter(edge => edge.kind !== "intent" || (phases[edge.id] ?? "rest") !== "rest");
  const focus = useRovingFocus([...readingOrder([...graph.nodes, ...ghosts]), ...edges.map(edge => edge.id)]);

  const propsOf = (node: GraphNode): NodeProps => ({
    id: node.id,
    label: node.label,
    caption: captions[node.id] ?? MAP_NODE_CAPTIONS[node.role],
    position: node.position,
    focus,
    onActivate,
  });

  return (
    <div className="flex h-full w-full flex-col">
      <svg
        viewBox={`0 0 ${graph.width} ${graph.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="graphics-document"
        aria-label={MAP_LABELS.title}
        className="min-h-0 w-full flex-1"
      >
        {edges.map(edge => {
          const from = nodesById.get(edge.from);
          const to = nodesById.get(edge.to);
          const route = routeOnMap(edge, nodesById);
          if (!from || !to || !route) return null;
          const caption = mapEdgeCaption(edge.kind, from.role, to.role);
          return (
            <GraphEdge
              key={edge.id}
              id={edge.id}
              kind={edge.kind}
              phase={phases[edge.id] ?? "rest"}
              route={route}
              label={mapEdgeLabel(edge.kind, { from: from.label, to: to.label }, caption)}
              caption={caption}
              focus={focus}
              onActivate={onActivate}
            />
          );
        })}
        {graph.nodes.map(node => {
          switch (node.role) {
            case "governanceAccount":
              return (
                <TreasuryNode
                  key={node.id}
                  {...propsOf(node)}
                  caption={captions[node.id] ?? MAP_LABELS.councilCaption}
                  rule={councilRuleLabel(council)}
                  threshold={council.threshold}
                  signed={signed}
                />
              );
            case "executor":
            case "target":
              return <ContractNode key={node.id} {...propsOf(node)} />;
            case "external":
              // A configured external entity is a contract the system calls; one a proposal introduced
              // is an account it would pay, such as a transfer's recipient.
              return node.id === externalNodeId(node.ref) ? (
                <AccountNode key={node.id} {...propsOf(node)} />
              ) : (
                <ContractNode key={node.id} {...propsOf(node)} tone="external" />
              );
            case "token":
              return <TokenNode key={node.id} {...propsOf(node)} />;
            case "member":
            case "proposer":
              return <AccountNode key={node.id} {...propsOf(node)} />;
          }
        })}
        {ghosts.map(ghost => (
          <AccountNode key={ghost.id} {...ghost} focus={focus} onActivate={onActivate} tone="ghost" />
        ))}
      </svg>
      <Legend />
    </div>
  );
}
