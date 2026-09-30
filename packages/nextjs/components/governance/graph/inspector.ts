/**
 * What the inspector says about the node or edge someone selected: a kicker, a title, one paragraph
 * and the ids behind it. Pure, so which words go with which role or edge kind is tested without React.
 *
 * The words come from the role or the edge kind (`copy.ts`), unless the layout has its own for that
 * id (`InspectorCopy`, which a demo writes). Adding a role or an edge kind means adding its words to
 * `copy.ts`, not a branch here.
 */
import type { MapItemRef } from "./MapItem";
import { MAP_INSPECTOR, contractKicker, inspectorEdgeBody, inspectorEdgeTitle, inspectorNodeBody } from "./copy";
import { type GhostNode, type InspectorCopy, isIntroducedAccount } from "./mapModel";
import type { CouncilKey, Proposer } from "@sh/core/governance/council";
import { GOVERNANCE_CONTRACTS } from "~~/config/governanceConfig";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";
import {
  EXECUTOR_NODE_ID,
  GOVERNANCE_ACCOUNT_NODE_ID,
  type GovernanceGraph,
  type GraphNode,
} from "~~/services/liveMap/model/graph";
import { MAP_ENTITY_IDS } from "~~/services/liveMap/model/graphEntities";

/** One row of the folded "Ids and links": an id, and its HashScan page when there is one. */
export type InspectorRow = { term: string; value: string; href?: string };

export type InspectorContent = { kicker: string; title: string; body: string; rows: InspectorRow[] };

export type InspectorContext = {
  graph: GovernanceGraph;
  ghosts: readonly GhostNode[];
  /** The council as the ledger has it now: the treasury's paragraph names its rule. */
  council: CouncilKey;
  /** `PROPOSER_ROLE` holders: a seat is only a key, and this is how its account is known. */
  proposers: readonly Proposer[];
  copy: InspectorCopy;
  /** The target network's HashScan, e.g. `https://hashscan.io/testnet`; without one, ids are not links. */
  explorerUrl?: string;
};

/** The deployment name each configured contract is known by, for its kicker. */
const CONTRACT_NAMES: Partial<Record<string, string>> = {
  [EXECUTOR_NODE_ID]: GOVERNANCE_CONTRACTS.executor,
  [MAP_ENTITY_IDS.vault]: GOVERNANCE_CONTRACTS.vault,
  [MAP_ENTITY_IDS.tokenAdmin]: GOVERNANCE_CONTRACTS.tokenAdmin,
  [MAP_ENTITY_IDS.swapAdapter]: GOVERNANCE_CONTRACTS.swapAdapter,
};

type HashScanPage = "account" | "contract" | "token";

/** Which HashScan page a node has; a council seat is a key, which has none of its own. */
function pageOf(node: GraphNode): HashScanPage | null {
  switch (node.role) {
    case "governanceAccount":
    case "proposer":
      return "account";
    case "executor":
    case "target":
      return "contract";
    case "token":
      return "token";
    case "external":
      return isIntroducedAccount(node) ? "account" : "contract";
    case "member":
      return null;
  }
}

function kickerOf(node: GraphNode): string {
  const page = pageOf(node);
  if (node.role === "external" && page === "contract") return MAP_INSPECTOR.kickers.externalContract;
  if (page === "contract") return contractKicker(CONTRACT_NAMES[node.id]);
  if (page === "token") return MAP_INSPECTOR.kickers.token;
  return MAP_INSPECTOR.kickers.account;
}

const accountOfSeat = (node: GraphNode, proposers: readonly Proposer[]) =>
  node.role === "member" ? proposers.find(proposer => proposer.key === node.ref)?.accountId : undefined;

function link(page: HashScanPage, id: string, explorerUrl: string | undefined): string | undefined {
  return explorerUrl ? `${explorerUrl}/${page}/${id}` : undefined;
}

/**
 * The id a node goes by, with its link: a seat by the account holding its key when a proposer does,
 * else by the key itself, which has no page.
 */
function idRowOf(node: GraphNode, term: string, context: InspectorContext): InspectorRow {
  const page = pageOf(node);
  if (page) return { term, value: node.ref, href: link(page, node.ref, context.explorerUrl) };
  const account = accountOfSeat(node, context.proposers);
  if (account) return { term, value: account, href: link("account", account, context.explorerUrl) };
  return { term, value: node.ref };
}

function nodeRows(node: GraphNode, context: InspectorContext): InspectorRow[] {
  const { terms } = MAP_INSPECTOR;
  // A stand-in names no ledger entity, so it has no id to show.
  if (node.standIn) return [];
  if (node.role !== "member") return [idRowOf(node, terms.id, context)];
  const account = accountOfSeat(node, context.proposers);
  const key = { term: terms.key, value: node.ref };
  return account ? [idRowOf(node, terms.account, context), key] : [key];
}

function nodeContent(node: GraphNode, context: InspectorContext): InspectorContent {
  const { graph, council, proposers, copy } = context;
  const seated = graph.edges.some(
    edge => edge.kind === "authority" && edge.from === node.id && edge.to === GOVERNANCE_ACCOUNT_NODE_ID,
  );
  const proposes = accountOfSeat(node, proposers) !== undefined;
  const body =
    copy.nodes[node.id] ??
    inspectorNodeBody(node.role, {
      rule: councilRuleLabel(council),
      seated,
      proposes,
      introduced: isIntroducedAccount(node),
    });
  // Read from the ledger's proposer list, so a layout's own words for a seat never hide it.
  const kicker = seated && proposes ? `${kickerOf(node)} · ${MAP_INSPECTOR.alsoProposes}` : kickerOf(node);
  return { kicker, title: node.label, body, rows: nodeRows(node, context) };
}

function ghostContent(ghost: GhostNode, copy: InspectorCopy): InspectorContent {
  return {
    kicker: MAP_INSPECTOR.kickers.account,
    title: ghost.label,
    body: copy.nodes[ghost.id] ?? MAP_INSPECTOR.ghost,
    rows: [],
  };
}

/** The card for one selected item, or null when the item is no longer on the map. */
export function inspectorContentOf(item: MapItemRef, context: InspectorContext): InspectorContent | null {
  const { graph, ghosts, copy } = context;
  const nodeById = (id: string) => graph.nodes.find(node => node.id === id);

  if (item.kind === "node") {
    const node = nodeById(item.id);
    if (node) return nodeContent(node, context);
    const ghost = ghosts.find(candidate => candidate.id === item.id);
    return ghost ? ghostContent(ghost, copy) : null;
  }

  const edge = graph.edges.find(candidate => candidate.id === item.id);
  const from = edge && nodeById(edge.from);
  const to = edge && nodeById(edge.to);
  if (!edge || !from || !to) return null;
  const { kickers, terms } = MAP_INSPECTOR;
  return {
    kicker: kickers[edge.kind],
    title: inspectorEdgeTitle(from.label, to.label),
    body: copy.edges[edge.id] ?? inspectorEdgeBody(edge.kind, from.role, to.role),
    rows: [idRowOf(from, terms.from, context), idRowOf(to, terms.to, context)],
  };
}
