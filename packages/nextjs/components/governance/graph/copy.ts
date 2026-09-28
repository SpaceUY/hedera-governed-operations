/**
 * The words the governance map uses: node names and captions, edge captions and the legend. Nodes
 * are named for what exists on the ledger, never for an action: an operation is something that
 * travels along the edges and then switches off.
 */
import type { EdgeKind, NodeRole } from "~~/services/liveMap/model/graph";

/** The map's title, the names of its standing nodes, and what it says while it cannot draw. */
export const MAP_LABELS = {
  title: "Map of the governed system: who may act, and where the money is",
  loading: "Reading the council from the Mirror Node…",
  unavailable: "The council could not be read, so the map cannot be drawn right now.",
  governanceAccount: "Treasury",
  executor: "Proposal registry",
  vault: "Vault",
  tokenAdmin: "Token admin",
  swapAdapter: "Swap adapter",
  router: "Swap router",
  councilCaption: "council",
  /** The seat the connected account holds. */
  you: "You",
} as const;

/** What a node is, under its name; a demo layout may say it more specifically. */
export const MAP_NODE_CAPTIONS: Record<NodeRole, string> = {
  member: "council member",
  proposer: "may propose",
  governanceAccount: "governance account",
  executor: "only the treasury may run it",
  target: "contract",
  token: "HTS token",
  external: "outside the system",
};

/** A council member whose account is not known here, by the start of its key. */
export function unnamedMemberLabel(key: string): string {
  return `Member ${key.slice(0, 6)}…`;
}

const EDGE_KIND_LABELS: Record<EdgeKind, string> = {
  authority: "May act",
  intent: "Would happen",
  funds: "Money",
};

/**
 * What an edge means, from the roles at its ends. The standing edges are the trust chain: a seat on
 * the council, `PROPOSER_ROLE`, `EXECUTOR_ROLE`, a contract that only accepts the registry.
 */
export function mapEdgeCaption(kind: EdgeKind, from: NodeRole, to: NodeRole): string {
  if (kind === "funds") return "where the money is";
  if (kind === "intent") return "a pending proposal would use this";
  if (to === "governanceAccount") return "is one of the keys";
  if (to === "executor" && from === "governanceAccount") return "EXECUTOR_ROLE · runs what the council approved";
  if (to === "executor") return "PROPOSER_ROLE · registers with 1 signature, no council";
  if (from === "executor") return "only accepts the registry";
  if (to === "token") return "holds the token's keys";
  return "calls it";
}

/** The accessible name of an edge: what kind it is, between which nodes, and what it means. */
export function mapEdgeLabel(kind: EdgeKind, ends: { from: string; to: string }, caption: string): string {
  return `${EDGE_KIND_LABELS[kind]}: ${ends.from} to ${ends.to}, ${caption}`;
}

/** The legend, always on the canvas. */
export const MAP_LEGEND = {
  heading: "Legend",
  lines: [
    { swatch: "authority", term: "Solid", meaning: "who may act" },
    { swatch: "preview", term: "Dashed violet", meaning: "would happen" },
    { swatch: "funds", term: "Dotted", meaning: "where the money is" },
    { swatch: "activity", term: "Amber · mint", meaning: "in progress · done, then it switches off" },
  ],
  shapes: { account: "account", contract: "contract", token: "token" },
} as const;

/**
 * The toast for an approval this screen did not send, which the map read from the ledger like any
 * other; `member` is the seat's name on the map, when it has one.
 */
export function remoteSignatureMessage(member: string | undefined, proposal: string): string {
  return `${member ?? "A council member"} signed “${proposal}” elsewhere. Nobody pressed anything here: the map read it from the ledger.`;
}
