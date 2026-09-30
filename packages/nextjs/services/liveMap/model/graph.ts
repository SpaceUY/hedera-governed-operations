/**
 * The governance system as a graph: who holds authority over what, where the money is, and the path
 * a proposal would take. Pure data, no React and no drawing, so a hook that diffs two snapshots can
 * use it as well as the component that renders it.
 *
 * Node ids are stable across polls, since a diff and an animation address nodes by id: the two fixed
 * points are `governanceAccount` and `executor`, a council member is its key, a proposer its account,
 * and everything configured is named by whoever builds the snapshot (`GraphEntity.id`). Anything a
 * pending proposal names that the configuration does not know — a transfer's recipient, an incoming
 * council member — becomes a node of its own, so the map always shows where a proposal would go.
 */
import { type RoutableOperation, type RouteRole, decodedOperationOf, routeOf } from "./proposalRoutes";
import { ContractId } from "@hiero-ledger/sdk";
import type { CouncilKey, Proposer } from "@sh/core/governance/council";
import type { Proposal } from "@sh/core/governance/proposals";
import { isValidEntityId } from "@sh/core/mirror";
import { canShowIntent } from "~~/services/governance/proposalActions";

export type NodeRole = "member" | "proposer" | "governanceAccount" | "executor" | "target" | "token" | "external";

/**
 * - `authority`: a standing permission — a council seat, `PROPOSER_ROLE`, `EXECUTOR_ROLE`, a
 *   contract that only accepts the executor, a token whose keys a contract holds.
 * - `funds`: where the money is or goes back to.
 * - `intent`: a relationship nothing grants today and a pending proposal would use, such as a
 *   transfer to a new recipient or a seat an incoming member would take. It only means something
 *   while that proposal is shown, so it is not drawn at rest.
 */
export type EdgeKind = "authority" | "intent" | "funds";

/** What an edge is doing right now; the graph itself is always at `rest`, the layers above set the rest. `void` is the path a settled proposal never took. */
export type EdgePhase = "rest" | "preview" | "progress" | "complete" | "failed" | "void";

export type Point = { x: number; y: number };

export type GraphNode = {
  id: string;
  role: NodeRole;
  /** What the node stands for on the ledger: a `0.0.x` id, an EVM address, or a member's base64 key. */
  ref: string;
  /** The EVM address the node is also known by, when it is not the long-zero form of `ref`. */
  evmAddress?: string;
  /** For a council seat, the account whose key holds it when that account proposes: a payment to it reaches the seat. */
  accountId?: string;
  /**
   * Set on the one node that stands for no ledger entity yet: the account a payment would reach before
   * the form names it (`RECIPIENT_STAND_IN_NODE_ID`). Its `ref` is empty, and no ref ever finds it.
   */
  standIn?: true;
  label: string;
  position: Point;
};

export type GraphEdge = { id: string; kind: EdgeKind; from: string; to: string };

export type GovernanceGraph = { width: number; height: number; nodes: GraphNode[]; edges: GraphEdge[] };

/** A standing edge from a configured entity; `to` is a node id. */
export type GraphLink = { to: string; kind: Exclude<EdgeKind, "intent"> };

/** A contract, token or account the configuration knows about, with the id the layout places it by. */
export type GraphEntity = {
  id: string;
  role: "target" | "token" | "external";
  ref: string;
  /**
   * The EVM address the entity is also known by, when it is not the long-zero form of `ref`: a
   * contract deployed through the JSON-RPC relay, whose address the registry entry names.
   */
  evmAddress?: string;
  links?: GraphLink[];
};

export type GraphSnapshot = {
  governanceAccountId: string;
  executor: { ref: string; evmAddress?: string };
  council: CouncilKey;
  /** `PROPOSER_ROLE` holders; one whose key holds a seat is drawn as that member, not twice. */
  proposers: Proposer[];
  entities: GraphEntity[];
  /**
   * Only the ones the graph can vouch for shape it (`canShowIntent`): a settled proposal would go
   * nowhere any more, a schedule whose registry entry is cancelled or already ran would only revert,
   * and one the relay could not be asked about draws no preview either — a person may still sign it,
   * but the map does not claim to know what it would currently do.
   */
  proposals: Proposal[];
  /**
   * The operation the map previews — a draft being written, or the proposal selected in the rail —
   * whether or not the council could still sign it: a settled transfer still needs its recipient
   * drawn to show where it went. A kind picked in the wizard before its form holds an operation is
   * previewed as a sketch of its route. Absent when nothing is previewed.
   */
  previewed?: RoutableOperation | null;
  /**
   * Draw a node for a payment's recipient before anyone is named (`RECIPIENT_STAND_IN_NODE_ID`),
   * which a sketched payment reaches. A layout asks for it; without one a recipient appears only once named.
   */
  recipientStandIn?: boolean;
};

/** Where a demo places and names nodes. Anything it leaves out falls back to `autoLayout` and the node's ref. */
export type GraphLayout = {
  width: number;
  height: number;
  positions: Partial<Record<string, Point>>;
  labels?: Partial<Record<string, string>>;
};

/**
 * Node and edge ids in the order the operation travels them. `hops` groups the edges by step of the
 * route: the edges of one hop are travelled at once (a transfer to two recipients, every seat of a
 * rotation), the hops one after the other.
 */
export type GraphScope = { nodeIds: string[]; edgeIds: string[]; hops: string[][] };

export const GOVERNANCE_ACCOUNT_NODE_ID = "governanceAccount";
export const EXECUTOR_NODE_ID = "executor";
/** The account a payment would reach before the form names it; see `GraphNode.standIn`. */
export const RECIPIENT_STAND_IN_NODE_ID = "standIn:recipient";

export const memberNodeId = (key: string): string => `member:${key}`;
export const proposerNodeId = (accountId: string): string => `proposer:${accountId}`;
export const edgeId = (from: string, to: string): string => `${from}->${to}`;

/** A node a pending proposal introduced because the configuration does not know it: a recipient, say. */
export const externalNodeId = (ref: string): string => `external:${ref.toLowerCase()}`;

const AUTO_LAYOUT: GraphLayout = { width: 1000, height: 600, positions: {} };

/** Members and proposers on the left, then the governance account, the executor, its targets, what they reach. */
const COLUMN_OF: Record<NodeRole, number> = {
  member: 0,
  proposer: 0,
  governanceAccount: 1,
  executor: 2,
  target: 3,
  token: 4,
  external: 4,
};
const COLUMNS = 5;

/**
 * Every spelling of one entity: a `0.0.x` id is also reachable at its long-zero address, and an EVM
 * address is compared case-insensitively since a decoded one comes back checksummed. Anything else —
 * a member's base64 key, a key alias — is compared as it is.
 */
function spellingsOf(ref: string): string[] {
  if (isValidEntityId(ref)) return [ref, `0x${ContractId.fromString(ref).toEvmAddress()}`];
  if (ref.startsWith("0x")) return [ref.toLowerCase()];
  return [ref];
}

type NamedNode = Omit<GraphNode, "label" | "position">;

type GraphParts = { nodes: NamedNode[]; edges: GraphEdge[] };

function findNode(nodes: readonly NamedNode[], ref: string): NamedNode | undefined {
  const wanted = spellingsOf(ref);
  return nodes.find(
    node =>
      !node.standIn &&
      [node.ref, node.evmAddress, node.accountId]
        .flatMap(named => (named ? spellingsOf(named) : []))
        .some(spelling => wanted.includes(spelling)),
  );
}

/** The node standing for a ledger entity, by any spelling of it: a `0.0.x` id, an EVM address in any case, a key. */
export function nodeIdOfRef(graph: Pick<GovernanceGraph, "nodes">, ref: string): string | undefined {
  return findNode(graph.nodes, ref)?.id;
}

/** A role's endpoint: a node the graph has, or a ref it does not know yet. */
type Endpoint = { nodeId: string } | { ref: string; role: NodeRole };

function endpointsFor(refs: string[], role: NodeRole, context: Readonly<GraphParts>): Endpoint[] {
  return refs.map(ref => {
    const node = findNode(context.nodes, ref);
    return node ? { nodeId: node.id } : { ref, role };
  });
}

/**
 * The node a subject has authority over, which for a swap adapter is the router it calls. The
 * adapter's entity must declare exactly one authority link, to the router, or the swap gets no route.
 */
function calleeOf(subject: Endpoint[], context: Readonly<GraphParts>): Endpoint[] | null {
  const [only] = subject;
  if (subject.length !== 1 || !("nodeId" in only)) return null;
  const links = context.edges.filter(({ from, kind }) => from === only.nodeId && kind === "authority");
  return links.length === 1 ? [{ nodeId: links[0].to }] : null;
}

type ResolvedRoute = Array<{ from: Endpoint[]; to: Endpoint[] }>;

type Resolution = { steps: ResolvedRoute; roles: Partial<Record<RouteRole, Endpoint[]>> };

/**
 * Who a payment reaches: the accounts it names, or — for a sketch, whose form has named nobody yet —
 * the stand-in for one. A decoded payment that credits nobody reaches nobody.
 */
function recipientsFor(operation: RoutableOperation, refs: string[] | undefined, context: Readonly<GraphParts>) {
  if (operation.kind !== "sketch" || refs?.length) return endpointsFor(refs ?? [], "external", context);
  const standIn = context.nodes.find(node => node.standIn);
  return standIn ? [{ nodeId: standIn.id }] : [];
}

/**
 * The route's roles as endpoints, or null when the operation cannot be placed honestly: it acts on
 * an account other than the governance account, or it needs a node the graph cannot supply.
 */
function resolveRoute(operation: RoutableOperation, context: Readonly<GraphParts>): Resolution | null {
  const route = routeOf(operation);
  if (!route) return null;

  const actsOnGovernanceAccount = (route.refs.governanceAccount ?? []).every(
    ref => findNode(context.nodes, ref)?.id === GOVERNANCE_ACCOUNT_NODE_ID,
  );
  if (!actsOnGovernanceAccount) return null;

  const subject = endpointsFor(route.refs.subject ?? [], "external", context);
  const currentMembers = context.nodes.filter(node => node.role === "member" && isSeated(node.id, context.edges));
  const endpoints: Record<RouteRole, Endpoint[] | null> = {
    governanceAccount: [{ nodeId: GOVERNANCE_ACCOUNT_NODE_ID }],
    executor: [{ nodeId: EXECUTOR_NODE_ID }],
    subject,
    token: endpointsFor(route.refs.token ?? [], "token", context),
    router: calleeOf(subject, context),
    recipient: recipientsFor(operation, route.refs.recipient, context),
    member: dedupeEndpoints([
      ...currentMembers.map(node => ({ nodeId: node.id })),
      ...endpointsFor(route.refs.member ?? [], "member", context),
    ]),
  };

  const steps: ResolvedRoute = [];
  const roles: Resolution["roles"] = {};
  for (const step of route.steps) {
    const from = endpoints[step.from];
    const to = endpoints[step.to];
    if (!from?.length || !to?.length) return null;
    steps.push({ from, to });
    roles[step.from] = from;
    roles[step.to] = to;
  }
  return { steps, roles };
}

const isSeated = (nodeId: string, edges: readonly GraphEdge[]): boolean =>
  edges.some(edge => edge.from === nodeId && edge.to === GOVERNANCE_ACCOUNT_NODE_ID && edge.kind === "authority");

const endpointKey = (endpoint: Endpoint): string => ("nodeId" in endpoint ? endpoint.nodeId : endpoint.ref);

function dedupeEndpoints(endpoints: Endpoint[]): Endpoint[] {
  const byKey = new Map(endpoints.map(endpoint => [endpointKey(endpoint), endpoint]));
  return [...byKey.values()];
}

/** A seat, known also by the account whose key holds it when that account proposes. */
function seatOf(key: string, proposers: readonly Proposer[]): NamedNode {
  const accountId = proposers.find(proposer => proposer.key === key)?.accountId;
  return { id: memberNodeId(key), role: "member", ref: key, ...(accountId ? { accountId } : {}) };
}

function structureOf(snapshot: GraphSnapshot): GraphParts {
  const nodes: NamedNode[] = [
    ...snapshot.council.memberKeys.map(key => seatOf(key, snapshot.proposers)),
    { id: GOVERNANCE_ACCOUNT_NODE_ID, role: "governanceAccount", ref: snapshot.governanceAccountId },
    { id: EXECUTOR_NODE_ID, role: "executor", ...snapshot.executor },
    ...snapshot.entities.map(({ id, role, ref, evmAddress }) => ({ id, role, ref, evmAddress })),
  ];
  if (snapshot.recipientStandIn) {
    nodes.push({ id: RECIPIENT_STAND_IN_NODE_ID, role: "external", ref: "", standIn: true });
  }
  const edges: GraphEdge[] = [];
  const connect = (from: string, to: string, kind: EdgeKind) => {
    if (!edges.some(edge => edge.id === edgeId(from, to))) edges.push({ id: edgeId(from, to), kind, from, to });
  };

  for (const key of snapshot.council.memberKeys) connect(memberNodeId(key), GOVERNANCE_ACCOUNT_NODE_ID, "authority");
  connect(GOVERNANCE_ACCOUNT_NODE_ID, EXECUTOR_NODE_ID, "authority");

  // A proposer already on the map — a seated member, by key, or a configured account — keeps that
  // node and gains the edge, so one person is never drawn twice.
  for (const { accountId, key } of snapshot.proposers) {
    const seat = key && snapshot.council.memberKeys.includes(key) ? memberNodeId(key) : undefined;
    const id = seat ?? findNode(nodes, accountId)?.id ?? proposerNodeId(accountId);
    if (!nodes.some(node => node.id === id)) nodes.push({ id, role: "proposer", ref: accountId });
    connect(id, EXECUTOR_NODE_ID, "authority");
  }

  for (const entity of snapshot.entities) {
    if (entity.role === "target") connect(EXECUTOR_NODE_ID, entity.id, "authority");
    for (const link of entity.links ?? []) connect(entity.id, link.to, link.kind);
  }

  return { nodes, edges };
}

/** Adds what a pending proposal names but the configuration does not: its unknown endpoints and the edges it would use. */
function addIntent(operation: RoutableOperation, graph: GraphParts): void {
  const route = resolveRoute(operation, graph);
  if (!route) return;

  const nodeIdOf = (endpoint: Endpoint): string => {
    if ("nodeId" in endpoint) return endpoint.nodeId;
    const existing = findNode(graph.nodes, endpoint.ref);
    if (existing) return existing.id;
    const id = endpoint.role === "member" ? memberNodeId(endpoint.ref) : externalNodeId(endpoint.ref);
    graph.nodes.push({ id, role: endpoint.role, ref: endpoint.ref });
    return id;
  };

  for (const { from, to } of route.steps) {
    for (const source of from.map(nodeIdOf)) {
      for (const target of to.map(nodeIdOf)) {
        if (source === target || graph.edges.some(edge => edge.id === edgeId(source, target))) continue;
        graph.edges.push({ id: edgeId(source, target), kind: "intent", from: source, to: target });
      }
    }
  }
}

/**
 * A position for every node, by role in columns, spread evenly down each column in the order the
 * nodes come in. Crude on purpose: it is what the map falls back to without a hand-composed layout.
 */
export function autoLayout(
  nodes: ReadonlyArray<Pick<GraphNode, "id" | "role">>,
  size: Pick<GraphLayout, "width" | "height">,
): Record<string, Point> {
  const columns = Array.from({ length: COLUMNS }, (_unused, column) =>
    nodes.filter(node => COLUMN_OF[node.role] === column),
  );
  const columnWidth = size.width / COLUMNS;

  return Object.fromEntries(
    columns.flatMap((column, columnIndex) =>
      column.map((node, row) => [
        node.id,
        { x: columnWidth * (columnIndex + 0.5), y: (size.height / column.length) * (row + 0.5) },
      ]),
    ),
  );
}

/**
 * The graph for one snapshot of the ledger. Every edge is at rest here; previews and animations are
 * phases the layers above put on top, by edge id.
 */
export function deriveGraphState(snapshot: GraphSnapshot, layout: GraphLayout = AUTO_LAYOUT): GovernanceGraph {
  const graph = structureOf(snapshot);
  for (const proposal of snapshot.proposals) {
    if (canShowIntent(proposal)) addIntent(decodedOperationOf(proposal), graph);
  }
  if (snapshot.previewed) addIntent(snapshot.previewed, graph);

  const fallback = autoLayout(graph.nodes, layout);
  return {
    width: layout.width,
    height: layout.height,
    nodes: graph.nodes.map(node => ({
      ...node,
      label: layout.labels?.[node.id] ?? node.ref,
      position: layout.positions[node.id] ?? fallback[node.id],
    })),
    edges: graph.edges,
  };
}

/** The nodes each role of a route reached on a graph, by role. */
export type RoleNodes = Partial<Record<RouteRole, string[]>>;

/** An operation's route drawn on one graph: the scope it travels, and the nodes each of its roles reached. */
export type GraphRoute = { scope: GraphScope; roles: RoleNodes };

function scopeOfRoute(graph: GovernanceGraph, steps: ResolvedRoute): GraphScope | null {
  const nodeIds: string[] = [];
  const hops: string[][] = [];
  const visit = (id: string) => {
    if (!nodeIds.includes(id)) nodeIds.push(id);
  };

  for (const { from, to } of steps) {
    const hop: string[] = [];
    for (const source of from) {
      for (const target of to) {
        if (!("nodeId" in source) || !("nodeId" in target)) return null;
        const id = edgeId(source.nodeId, target.nodeId);
        if (!graph.edges.some(edge => edge.id === id)) return null;
        visit(source.nodeId);
        visit(target.nodeId);
        hop.push(id);
      }
    }
    hops.push(hop);
  }
  return { nodeIds, edgeIds: hops.flat(), hops };
}

function roleNodesOf(roles: Resolution["roles"]): RoleNodes {
  return Object.fromEntries(
    Object.entries(roles).map(([role, endpoints]) => [
      role,
      endpoints.flatMap(endpoint => ("nodeId" in endpoint ? [endpoint.nodeId] : [])),
    ]),
  );
}

/**
 * An operation's route on this graph, resolved once: the nodes and edges it would travel, in order,
 * and the nodes each of its roles reached — for words a role carries whoever fills it, such as a
 * payment's recipient before it is named. Null when there is nothing honest to show: an unrecognised
 * body, one that acts on an account other than the governance account, or a route this graph lacks a
 * node or an edge for (it was derived without the proposal).
 */
export function routeOnGraph(graph: GovernanceGraph, operation: RoutableOperation): GraphRoute | null {
  const route = resolveRoute(operation, graph);
  if (!route) return null;
  const scope = scopeOfRoute(graph, route.steps);
  return scope && { scope, roles: roleNodesOf(route.roles) };
}

/** The nodes and edges an operation would travel, in order, or null when it has no route here (`routeOnGraph`). */
export function scopeOf(graph: GovernanceGraph, operation: RoutableOperation): GraphScope | null {
  return routeOnGraph(graph, operation)?.scope ?? null;
}
