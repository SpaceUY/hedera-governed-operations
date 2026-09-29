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

/**
 * What state the ledger has a node in, where the map reads one; it takes the place of the caption.
 * The vault's two versions are the two contracts this template deploys for it.
 */
export const MAP_NODE_STATES = {
  vault: { first: "v1 · deposits only", next: "v2 · withdrawals on" },
  token: { paused: "Paused", active: "Active" },
} as const;

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
 * The banner for an approval this screen did not send, which the map read from the ledger like any
 * other; `member` is the seat's name on the map, when it has one.
 */
export function remoteSignatureMessage(member: string | undefined, proposal: string): string {
  return `${member ?? "A council member"} signed “${proposal}” from their own device. Nobody on this screen pressed anything — the poll saw it.`;
}

export const REMOTE_SIGNATURE_BANNER = { dismiss: "Dismiss" } as const;

/**
 * The inspector: the card that explains the node or edge someone clicked. Its kickers use the
 * legend's words, so the card and the legend describe a line the same way.
 */
export const MAP_INSPECTOR = {
  region: "Inspector",
  close: "Close inspector",
  links: "Ids and links",
  kickers: {
    account: "Account",
    contract: "Contract",
    externalContract: "External contract",
    token: "Token",
    authority: "Who may act",
    funds: "Where the money is",
    intent: "Would happen",
  },
  terms: { id: "Id", account: "Account", key: "Key", from: "From", to: "To" },
  /** Something a layout draws that the ledger does not have: there is nothing to say about it yet. */
  ghost: "Not on the ledger yet, so no line connects it.",
  /** Added to a council seat's kicker when the account holding it also holds `PROPOSER_ROLE`. */
  alsoProposes: "may also propose",
} as const;

/** A contract's kicker, with its deployment name when the map knows it. */
export function contractKicker(contractName: string | undefined): string {
  return contractName ? `${MAP_INSPECTOR.kickers.contract} · ${contractName}` : MAP_INSPECTOR.kickers.contract;
}

/** An edge's title: where it starts and where it ends. */
export function inspectorEdgeTitle(from: string, to: string): string {
  return `${from} → ${to}`;
}

/** Joins "2-of-3" so the inspector's narrow card never breaks the rule across two lines. */
const unbreakable = (rule: string): string => rule.replaceAll("-", "\u2011");

const PROPOSER_ROLE_NOTE =
  "It holds PROPOSER_ROLE, so it can register a proposal with one signature and no council; registering is not approving.";

/**
 * What a node is, by its role. `rule` is the council's, as the ledger has it now ("2-of-3");
 * `seated` says whether a member's key is in the governance account's key today or would be put there
 * by a pending rotation, and `proposes` whether its account also holds `PROPOSER_ROLE`.
 */
export function inspectorNodeBody(
  role: NodeRole,
  facts: { rule: string; seated: boolean; proposes: boolean; introduced: boolean },
): string {
  switch (role) {
    case "governanceAccount":
      return `Holds a ThresholdKey made of the keys of a ${unbreakable(facts.rule)} council and pays for every approved operation. It is the only address with EXECUTOR_ROLE, so nothing it signs moves until enough of those keys have signed the schedule.`;
    case "executor":
      return "Stores each proposal's target and calldata. PROPOSER_ROLE may register; only the treasury account (EXECUTOR_ROLE) may execute. Its role admin is the contract itself, so changing roles is itself an approved proposal.";
    case "member": {
      const seat = facts.seated
        ? "One of the keys inside the treasury account's ThresholdKey, read from the Mirror Node; it is in no contract. It counts when it signs a proposal's schedule."
        : "Not one of the treasury's keys yet: a pending council rotation would seat it.";
      return facts.proposes ? `${seat} ${PROPOSER_ROLE_NOTE}` : seat;
    }
    case "proposer":
      return `${PROPOSER_ROLE_NOTE} It is not one of the treasury's keys, so it cannot approve.`;
    case "target":
      return "A contract the registry calls. It accepts calls only from the registry, so nothing reaches it without a proposal the council approved.";
    case "token":
      return "A token native to Hedera's Token Service. Its keys point at a contract, so no single person can use them: changing the token is a contract call the council approves.";
    case "external":
      return facts.introduced
        ? "An account outside the system that a pending proposal would pay, with a native scheduled transfer: no contract and no registry entry."
        : "Outside the system: nothing here controls it, the system only calls it.";
  }
}

/** What an edge means, from its kind and the roles at its ends — the inspector's longer `mapEdgeCaption`. */
export function inspectorEdgeBody(kind: EdgeKind, from: NodeRole, to: NodeRole): string {
  if (kind === "intent") return "Nothing grants this today: a pending proposal would use it once the council signs.";
  if (kind === "funds") {
    return from === "external"
      ? "Where the money goes: whatever this contract pays out settles straight back to the treasury."
      : "Where the money is: part of what the treasury governs is held here.";
  }
  if (to === "governanceAccount") {
    return "This key is one of the treasury's threshold keys. A signature from it travels this line into the ring.";
  }
  if (to === "executor" && from === "governanceAccount") {
    return "Only the treasury account holds EXECUTOR_ROLE, so a registered proposal runs only when the treasury's schedule gathers enough council signatures.";
  }
  if (to === "executor") {
    return "Registering a proposal takes one signature and no council. That is why this line goes around the treasury: registering is not approving.";
  }
  if (from === "executor") return "This contract accepts calls only from the registry.";
  if (to === "token")
    return "The token's keys are this contract. Changing the token is a contract call, so it needs the council.";
  return "This contract calls one outside the system, which nothing here controls.";
}
