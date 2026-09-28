/**
 * What the map draws for one snapshot: the graph with generic names, and whatever a hand-composed
 * layout adds on top — positions, names, captions, ghost nodes. Pure, so it is tested without React.
 *
 * The decoration is optional by design. Without one every node is placed by `autoLayout` and named by
 * its role or its ledger id; a demo passes its own decorator, and deleting the demo leaves this.
 */
import { MAP_LABELS, unnamedMemberLabel } from "./copy";
import type { CouncilKey } from "@sh/core/governance/council";
import {
  EXECUTOR_NODE_ID,
  GOVERNANCE_ACCOUNT_NODE_ID,
  type GovernanceGraph,
  type GraphLayout,
  type GraphNode,
  type GraphSnapshot,
  type Point,
  deriveGraphState,
  memberNodeId,
} from "~~/services/governance/graph";
import { MAP_ENTITY_IDS } from "~~/services/governance/graphEntities";

/**
 * Something the map shows that the ledger does not have yet, such as an account a demo is about to
 * propose as a member. It is drawn faded, is never connected, and never enters the graph a diff or a
 * preview reads.
 */
export type GhostNode = { id: string; label: string; caption: string; position: Point };

export type MapContext = { nodes: readonly GraphNode[]; proposers: GraphSnapshot["proposers"] };

export type MapDecoration = {
  layout: GraphLayout;
  /** A line under a node's name, by node id; a node without one gets its role's caption. */
  captions?: Partial<Record<string, string>>;
  ghosts?: GhostNode[];
};

/** Places and names the nodes of one graph; called with the nodes as the ledger produced them. */
export type MapDecorator = (context: MapContext) => MapDecoration;

export type ComposedMap = {
  graph: GovernanceGraph;
  captions: Partial<Record<string, string>>;
  ghosts: GhostNode[];
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
export function genericLabels({ nodes, proposers }: MapContext): Record<string, string> {
  const labels: Record<string, string> = { ...FIXED_LABELS };
  for (const node of nodes) {
    if (node.role !== "member") continue;
    labels[node.id] = proposers.find(({ key }) => key === node.ref)?.accountId ?? unnamedMemberLabel(node.ref);
  }
  return labels;
}

/**
 * The seat the connected account holds, or undefined. The account is matched to a seat through the
 * proposer list — the only accounts whose keys the map reads — so a seat whose holder is not a
 * proposer is never taken for the viewer's.
 */
export function viewerSeatOf({ nodes, proposers }: MapContext, viewerAccountId: string): string | undefined {
  const key = proposers.find(proposer => proposer.accountId === viewerAccountId)?.key;
  return nodes.find(node => node.role === "member" && node.ref === key)?.id;
}

/**
 * `viewerAccountId` is the connected account, if any: the seat it holds is named "You", over any name
 * the generic labels or a decoration gave it.
 */
export function composeMap(
  snapshot: GraphSnapshot,
  decorate?: MapDecorator,
  viewerAccountId?: string | null,
): ComposedMap {
  const { nodes } = deriveGraphState(snapshot, { ...AUTO_MAP_SIZE, positions: {} });
  const context: MapContext = { nodes, proposers: snapshot.proposers };
  const decoration = decorate?.(context);
  const layout = decoration?.layout ?? { ...AUTO_MAP_SIZE, positions: {} };
  const labels = labelsOf(context, layout, viewerSeatFor(context, viewerAccountId));

  return {
    graph: deriveGraphState(snapshot, { ...layout, labels }),
    captions: decoration?.captions ?? {},
    ghosts: decoration?.ghosts ?? [],
  };
}

const viewerSeatFor = (context: MapContext, viewerAccountId: string | null | undefined): string | undefined =>
  viewerAccountId ? viewerSeatOf(context, viewerAccountId) : undefined;

/** Generic names, then the decoration's, then "You" on the connected account's seat. */
function labelsOf(
  context: MapContext,
  layout: GraphLayout | undefined,
  viewerSeat: string | undefined,
): Partial<Record<string, string>> {
  const viewerLabel = viewerSeat ? { [viewerSeat]: MAP_LABELS.you } : {};
  return { ...genericLabels(context), ...layout?.labels, ...viewerLabel };
}

/** One council seat as the map names it; `isViewer` marks the connected account's, which the map calls "You". */
export type SeatName = { label: string; isViewer: boolean };

export type SeatNaming = { decorate?: MapDecorator; viewerAccountId?: string | null };

/**
 * The current council's seats in the council's order, by the names the map draws them with, for a
 * screen that lists the members in words. Only the seats are named, so no other node is needed.
 */
export function councilSeatNames(
  council: CouncilKey,
  proposers: GraphSnapshot["proposers"],
  { decorate, viewerAccountId }: SeatNaming,
): SeatName[] {
  const nodes: GraphNode[] = council.memberKeys.map(key => ({
    id: memberNodeId(key),
    role: "member",
    ref: key,
    label: key,
    position: { x: 0, y: 0 },
  }));
  const context: MapContext = { nodes, proposers };
  const viewerSeat = viewerSeatFor(context, viewerAccountId);
  const labels = labelsOf(context, decorate?.(context).layout, viewerSeat);
  return nodes.map(node => ({ label: labels[node.id] ?? node.label, isViewer: node.id === viewerSeat }));
}

/** Left to right, then top to bottom: the order a reader scans the map in, and the order focus moves in. */
export function readingOrder<T extends { id: string; position: Point }>(items: readonly T[]): string[] {
  return [...items]
    .sort((first, second) => first.position.x - second.position.x || first.position.y - second.position.y)
    .map(item => item.id);
}
