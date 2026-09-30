/**
 * What the map draws for one snapshot: the graph with generic names, and whatever a hand-composed
 * layout adds on top — positions, names, captions, ghost nodes. Pure, so it is tested without React.
 *
 * The decoration is optional by design. Without one every node is placed by `autoLayout` and named by
 * its role or its ledger id; a demo passes its own decorator, and deleting the demo leaves this.
 */
import { MAP_LABELS } from "./copy";
import { memberLabel } from "~~/services/governance/proposalLabels";
import {
  EXECUTOR_NODE_ID,
  GOVERNANCE_ACCOUNT_NODE_ID,
  type GovernanceGraph,
  type GraphLayout,
  type GraphNode,
  type GraphSnapshot,
  type Point,
  deriveGraphState,
  externalNodeId,
  scopeOf,
} from "~~/services/liveMap/model/graph";
import { MAP_ENTITY_IDS } from "~~/services/liveMap/model/graphEntities";
import type { DecodedOperation } from "~~/services/liveMap/model/proposalRoutes";

/**
 * Something the map shows that the ledger does not have yet, such as an account a demo is about to
 * propose as a member. It is drawn faded, is never connected, and never enters the graph a diff or a
 * preview reads.
 */
export type GhostNode = {
  id: string;
  label: string;
  caption: string;
  position: Point;
  /** In the circle, in place of the label's first letter. */
  monogram?: string;
};

/** A name for an area of a hand-composed layout, such as the column the council sits in. */
export type MapRegion = { label: string; position: Point; orientation: "horizontal" | "vertical" };

export type MapContext = {
  nodes: readonly GraphNode[];
  proposers: GraphSnapshot["proposers"];
  /** The council key of the co-signing agent the app was told about, or null: unconfigured, unread, or not one key. */
  agentSeat: string | null;
};

/** Who is looking and what the app knows outside the ledger: the connected account and the agent's seat. */
export type MapViewpoint = { viewerAccountId?: string | null; agentSeat?: string | null };

/**
 * What the inspector says about one layout's nodes and edges, by id, in place of what their role
 * says in general: a demo knows that its vault takes upgrades and that its token is called ACME.
 */
export type InspectorCopy = { nodes: Partial<Record<string, string>>; edges: Partial<Record<string, string>> };

export type MapDecoration = {
  layout: GraphLayout;
  /** A line under a node's name, by node id; a node without one gets its role's caption. */
  captions?: Partial<Record<string, string>>;
  /** The letters in a node's circle, by node id, where its name's first letter is not what it should say. */
  monograms?: Partial<Record<string, string>>;
  ghosts?: GhostNode[];
  regions?: MapRegion[];
  inspector?: InspectorCopy;
  /**
   * What the layout leaves out: nodes, with every edge that touches them, and single edges by id —
   * real entities and permissions the ledger has but a hand-composed story has no place for. Only
   * what is drawn changes; nothing is read differently.
   */
  hidden?: HiddenParts;
};

export type HiddenParts = { nodes?: readonly string[]; edges?: readonly string[] };

/** Places and names the nodes of one graph; called with the nodes as the ledger produced them. */
export type MapDecorator = (context: MapContext) => MapDecoration;

export type ComposedMap = {
  graph: GovernanceGraph;
  captions: Partial<Record<string, string>>;
  monograms: Partial<Record<string, string>>;
  ghosts: GhostNode[];
  regions: MapRegion[];
  inspector: InspectorCopy;
};

export const AUTO_MAP_SIZE = { width: 1000, height: 600 } as const;

const FIXED_LABELS: Record<string, string> = {
  [GOVERNANCE_ACCOUNT_NODE_ID]: MAP_LABELS.governanceAccount,
  [EXECUTOR_NODE_ID]: MAP_LABELS.executor,
  [MAP_ENTITY_IDS.vault]: MAP_LABELS.vault,
  [MAP_ENTITY_IDS.tokenAdmin]: MAP_LABELS.tokenAdmin,
  [MAP_ENTITY_IDS.swapAdapter]: MAP_LABELS.swapAdapter,
  [MAP_ENTITY_IDS.router]: MAP_LABELS.router,
};

/**
 * Names that need no demo: the fixed points by role, and a member by the account whose key holds the
 * seat when that account is a proposer (the only accounts whose keys the map reads), else by its key.
 */
export function genericLabels({ nodes, proposers }: Pick<MapContext, "nodes" | "proposers">): Record<string, string> {
  const labels: Record<string, string> = { ...FIXED_LABELS };
  for (const node of nodes) {
    if (node.role !== "member") continue;
    labels[node.id] = memberLabel(node.ref, proposers, null);
  }
  return labels;
}

/**
 * The seat the connected account holds, or undefined. The account is matched to a seat through the
 * proposer list — the only accounts whose keys the map reads — so a seat whose holder is not a
 * proposer is never taken for the viewer's.
 */
export function viewerSeatOf(
  { nodes, proposers }: Pick<MapContext, "nodes" | "proposers">,
  viewerAccountId: string,
): string | undefined {
  const key = proposers.find(proposer => proposer.accountId === viewerAccountId)?.key;
  return nodes.find(node => node.role === "member" && node.ref === key)?.id;
}

/**
 * `viewpoint.viewerAccountId` is the connected account, if any: the seat it holds is named "You", over
 * any name the generic labels or a decoration gave it. `viewpoint.agentSeat` reaches the decoration.
 */
export function composeMap(
  snapshot: GraphSnapshot,
  decorate?: MapDecorator,
  { viewerAccountId, agentSeat = null }: MapViewpoint = {},
): ComposedMap {
  const { nodes } = deriveGraphState(snapshot, { ...AUTO_MAP_SIZE, positions: {} });
  const context: MapContext = { nodes, proposers: snapshot.proposers, agentSeat };
  const labels = genericLabels(context);
  const decoration = decorate?.(context);
  const layout = decoration?.layout ?? { ...AUTO_MAP_SIZE, positions: {} };
  const viewerSeat = viewerAccountId ? viewerSeatOf(context, viewerAccountId) : undefined;
  const viewerLabel = viewerSeat ? { [viewerSeat]: MAP_LABELS.you } : {};

  const graph = deriveGraphState(snapshot, { ...layout, labels: { ...labels, ...layout.labels, ...viewerLabel } });
  return {
    graph: withoutHidden(graph, decoration?.hidden ?? {}),
    captions: decoration?.captions ?? {},
    monograms: decoration?.monograms ?? {},
    ghosts: decoration?.ghosts ?? [],
    regions: decoration?.regions ?? [],
    inspector: decoration?.inspector ?? { nodes: {}, edges: {} },
  };
}

/**
 * An `external` node is either a contract the configuration names, which the system calls, or an
 * account a pending proposal introduced — a transfer's recipient — whose id is built from its ref.
 */
export function isIntroducedAccount(node: Pick<GraphNode, "id" | "ref">): boolean {
  return node.id === externalNodeId(node.ref);
}

function withoutHidden(graph: GovernanceGraph, { nodes = [], edges = [] }: HiddenParts): GovernanceGraph {
  if (nodes.length === 0 && edges.length === 0) return graph;
  return {
    ...graph,
    nodes: graph.nodes.filter(node => !nodes.includes(node.id)),
    edges: graph.edges.filter(
      edge => !edges.includes(edge.id) && !nodes.includes(edge.from) && !nodes.includes(edge.to),
    ),
  };
}

/** Left to right, then top to bottom: the order a reader scans the map in, and the order focus moves in. */
export function readingOrder<T extends { id: string; position: Point }>(items: readonly T[]): string[] {
  return [...items]
    .sort((first, second) => first.position.x - second.position.x || first.position.y - second.position.y)
    .map(item => item.id);
}

/** A council seat as the map names it: its label, and the caption under it when a layout gave one. */
export type MemberName = { name: string; caption?: string };

/** Every seat on the map, by member key, named exactly as the map names its node. */
export function memberNamesOf({
  graph,
  captions,
}: Pick<ComposedMap, "graph" | "captions">): Record<string, MemberName> {
  const names: Record<string, MemberName> = {};
  for (const node of graph.nodes) {
    if (node.role === "member") names[node.ref] = { name: node.label, caption: captions[node.id] };
  }
  return names;
}

/**
 * The nodes an operation would travel, in order and by their names on the map — "Treasury → Proposal
 * registry → Vault" — or null when the map cannot draw that route (see `scopeOf`).
 */
export function routeNamesOf(graph: GovernanceGraph, operation: DecodedOperation): string[] | null {
  const scope = scopeOf(graph, operation);
  if (!scope) return null;
  const labels = new Map(graph.nodes.map(node => [node.id, node.label]));
  return scope.nodeIds.map(id => labels.get(id) ?? id);
}
