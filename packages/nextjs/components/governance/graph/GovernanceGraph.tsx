"use client";

import { useMemo } from "react";
import { AccountNode } from "./AccountNode";
import { Comet } from "./Comet";
import { ContractNode } from "./ContractNode";
import { GraphEdge } from "./GraphEdge";
import { Legend } from "./Legend";
import type { MapItemRef } from "./MapItem";
import { TokenNode } from "./TokenNode";
import { TreasuryNode } from "./TreasuryNode";
import { MAP_LABELS, MAP_NODE_CAPTIONS, mapEdgeCaption, mapEdgeLabel } from "./copy";
import { routeOnMap } from "./geometry";
import { type GhostNode, readingOrder } from "./mapModel";
import type { NodeProps } from "./nodeProps";
import { useRovingFocus } from "./useRovingFocus";
import type { CouncilKey } from "@sh/core/governance/council";
import { type GovernanceGraph as Graph, type GraphNode, externalNodeId } from "~~/services/governance/graph";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";
import { type MapFrame, REST_FRAME } from "~~/services/liveMap/motion/frame";

export type GovernanceGraphProps = {
  graph: Graph;
  council: CouncilKey;
  captions?: Partial<Record<string, string>>;
  ghosts?: GhostNode[];
  /**
   * What is lit, travelling or flashing right now (`frameOf`); at rest by default. An edge the frame
   * does not name is at rest, and an `intent` edge is only drawn while the frame names it.
   */
  frame?: MapFrame;
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
  frame = REST_FRAME,
  onActivate,
}: GovernanceGraphProps) {
  const { phases } = frame;
  const nodesById = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes]);
  const edgesById = useMemo(() => new Map(graph.edges.map(edge => [edge.id, edge])), [graph.edges]);
  const edges = graph.edges.filter(edge => edge.kind !== "intent" || phases[edge.id] !== undefined);
  const focus = useRovingFocus([...readingOrder([...graph.nodes, ...ghosts]), ...edges.map(edge => edge.id)]);

  const propsOf = (node: GraphNode): NodeProps => ({
    id: node.id,
    label: node.label,
    caption: captions[node.id] ?? MAP_NODE_CAPTIONS[node.role],
    position: node.position,
    focus,
    onActivate,
    highlight: frame.highlights[node.id],
  });

  const drawNode = (node: GraphNode) => {
    switch (node.role) {
      case "governanceAccount":
        return (
          <TreasuryNode
            {...propsOf(node)}
            caption={captions[node.id] ?? MAP_LABELS.councilCaption}
            rule={councilRuleLabel(council)}
            threshold={council.threshold}
            signed={frame.ring?.signed ?? 0}
            snap={frame.ring?.snap}
          />
        );
      case "executor":
      case "target":
        return <ContractNode {...propsOf(node)} />;
      case "external":
        // A configured external entity is a contract the system calls; one a proposal introduced
        // is an account it would pay, such as a transfer's recipient.
        return node.id === externalNodeId(node.ref) ? (
          <AccountNode {...propsOf(node)} />
        ) : (
          <ContractNode {...propsOf(node)} tone="external" />
        );
      case "token":
        return <TokenNode {...propsOf(node)} />;
      case "member":
      case "proposer":
        return <AccountNode {...propsOf(node)} />;
    }
  };

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
        {frame.comets.map(comet => {
          const edge = edgesById.get(comet.edgeId);
          const route = edge && routeOnMap(edge, nodesById);
          return route ? <Comet key={`${comet.edgeId}:${comet.direction}`} route={route} comet={comet} /> : null;
        })}
        {graph.nodes.map(node => (
          // A node that failed to take an operation shakes; the group keeps the shake off the node's
          // own position, which is an SVG transform.
          <g key={node.id} className={frame.shaking.includes(node.id) ? "motion-safe:animate-map-shake" : undefined}>
            {drawNode(node)}
          </g>
        ))}
        {ghosts.map(ghost => (
          <AccountNode key={ghost.id} {...ghost} focus={focus} onActivate={onActivate} tone="ghost" />
        ))}
      </svg>
      <Legend />
    </div>
  );
}
