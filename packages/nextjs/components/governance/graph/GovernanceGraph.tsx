"use client";

import { type ReactNode, useMemo } from "react";
import { AccountNode } from "./AccountNode";
import { Comet } from "./Comet";
import { ContractNode } from "./ContractNode";
import { GraphEdge } from "./GraphEdge";
import { Legend } from "./Legend";
import type { MapActivation } from "./MapItem";
import { TokenNode } from "./TokenNode";
import { TreasuryNode } from "./TreasuryNode";
import { MAP_LABELS, MAP_NODE_CAPTIONS, mapEdgeCaption, mapEdgeLabel } from "./copy";
import { TREASURY_OUTLINE, routeOnMap } from "./geometry";
import { type GhostNode, type MapRegion, isIntroducedAccount, readingOrder } from "./mapModel";
import type { NodeProps } from "./nodeProps";
import { useRovingFocus } from "./useRovingFocus";
import type { CouncilKey } from "@sh/core/governance/council";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";
import {
  GOVERNANCE_ACCOUNT_NODE_ID,
  type GovernanceGraph as Graph,
  type GraphNode,
} from "~~/services/liveMap/model/graph";
import { driftOf } from "~~/services/liveMap/motion/ambient";
import { type MapFrame, REST_FRAME } from "~~/services/liveMap/motion/frame";
import { AMBIENT_MS } from "~~/services/liveMap/motion/timings";

export type GovernanceGraphProps = {
  graph: Graph;
  council: CouncilKey;
  captions?: Partial<Record<string, string>>;
  ghosts?: GhostNode[];
  regions?: MapRegion[];
  /**
   * What is lit, travelling or flashing right now (`frameOf`); at rest by default. An edge the frame
   * does not name is at rest, and an `intent` edge is only drawn while the frame names it.
   */
  frame?: MapFrame;
  /** What a click or Enter on a node or edge does, and which one is selected; items are inert without it. */
  activation?: MapActivation;
};

/**
 * A node's slow drift, a loop of its own (`driftOf`) — CSS only, and off under reduced motion. The
 * edges stay where they are: they end under the node's opaque plate, which covers a drift of 2 px.
 */
function Drift({ nodeId, children }: { nodeId: string; children: ReactNode }) {
  const { periodMs, phaseMs } = driftOf(nodeId);
  return (
    <g
      className="motion-safe:animate-map-drift"
      // `alternate`: out and back is one loop, so each way takes half of it.
      style={{ animationDuration: `${periodMs / 2}ms`, animationDelay: `-${phaseMs}ms` }}
    >
      {children}
    </g>
  );
}

/**
 * Rings of the primary colour fading outwards from the treasury, breathing on a slow loop. Lighter in
 * the light theme, where the same tint over a white page reads as hard-edged discs rather than a glow.
 */
const GLOW_RINGS = [3, 2.2, 1.5];

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
  regions = [],
  frame = REST_FRAME,
  activation,
}: GovernanceGraphProps) {
  const { phases } = frame;
  const nodesById = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes]);
  const edgesById = useMemo(() => new Map(graph.edges.map(edge => [edge.id, edge])), [graph.edges]);
  const edges = graph.edges.filter(edge => edge.kind !== "intent" || phases[edge.id] !== undefined);
  const treasury = nodesById.get(GOVERNANCE_ACCOUNT_NODE_ID);
  const focus = useRovingFocus([...readingOrder([...graph.nodes, ...ghosts]), ...edges.map(edge => edge.id)]);

  const propsOf = (node: GraphNode): NodeProps => ({
    id: node.id,
    label: node.label,
    caption: captions[node.id] ?? MAP_NODE_CAPTIONS[node.role],
    position: node.position,
    focus,
    activation,
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
        return isIntroducedAccount(node) ? (
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
        {treasury && (
          <g
            aria-hidden="true"
            className="pointer-events-none motion-safe:animate-map-glow"
            // `alternate`: brightening and fading back is one loop, so each way takes half of it.
            style={{ animationDuration: `${AMBIENT_MS.glow / 2}ms` }}
          >
            {GLOW_RINGS.map(scale => (
              <circle
                key={scale}
                cx={treasury.position.x}
                cy={treasury.position.y}
                r={TREASURY_OUTLINE * scale}
                className="fill-primary/2 dark:fill-primary/4"
              />
            ))}
          </g>
        )}
        {regions.map(({ label, position, orientation }) => (
          <text
            key={label}
            x={position.x}
            y={position.y}
            textAnchor="middle"
            transform={orientation === "vertical" ? `rotate(-90 ${position.x} ${position.y})` : undefined}
            className="fill-base-content/50 text-map-caption font-semibold uppercase tracking-widest"
          >
            {label}
          </text>
        ))}
        {edges.map(edge => {
          const from = nodesById.get(edge.from);
          const to = nodesById.get(edge.to);
          const route = routeOnMap(edge, nodesById);
          if (!from || !to || !route) return null;
          return (
            <GraphEdge
              key={edge.id}
              id={edge.id}
              kind={edge.kind}
              phase={phases[edge.id] ?? "rest"}
              route={route}
              label={mapEdgeLabel(
                edge.kind,
                { from: from.label, to: to.label },
                mapEdgeCaption(edge.kind, from.role, to.role),
              )}
              focus={focus}
              activation={activation}
            />
          );
        })}
        {frame.comets.map(comet => {
          const edge = edgesById.get(comet.edgeId);
          const route = edge && routeOnMap(edge, nodesById);
          return route ? <Comet key={`${comet.edgeId}:${comet.direction}`} route={route} comet={comet} /> : null;
        })}
        {graph.nodes.map(node => (
          <Drift key={node.id} nodeId={node.id}>
            {/* A node that failed to take an operation shakes; the group keeps the shake off the
                node's own position, which is an SVG transform. */}
            <g className={frame.shaking.includes(node.id) ? "motion-safe:animate-map-shake" : undefined}>
              {drawNode(node)}
            </g>
          </Drift>
        ))}
        {ghosts.map(ghost => (
          <Drift key={ghost.id} nodeId={ghost.id}>
            <AccountNode {...ghost} focus={focus} activation={activation} tone="ghost" />
          </Drift>
        ))}
      </svg>
      <Legend />
    </div>
  );
}
