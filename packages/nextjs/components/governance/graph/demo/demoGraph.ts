/**
 * Demo only: the hand-composed Live Map of the ACME treasury that `yarn setup` creates — where each
 * node sits, the names Alice, Bob and "Council account", the co-signing agent that is not a member
 * yet, and the words the inspector will show. The seat of whoever is connected is named "You" by the
 * map itself, not here. Delete this folder and the `decorate={decorateDemoMap}`
 * prop that passes it: the map falls back to placing nodes by role and naming them by id.
 */
import type { GhostNode, MapContext, MapDecorator } from "../mapModel";
import {
  EXECUTOR_NODE_ID,
  GOVERNANCE_ACCOUNT_NODE_ID,
  type Point,
  edgeId,
  memberNodeId,
} from "~~/services/governance/graph";
import { MAP_ENTITY_IDS } from "~~/services/governance/graphEntities";

const SIZE = { width: 1020, height: 700 } as const;

const FIXED_POSITIONS: Record<string, Point> = {
  [GOVERNANCE_ACCOUNT_NODE_ID]: { x: 300, y: 300 },
  [EXECUTOR_NODE_ID]: { x: 490, y: 170 },
  [MAP_ENTITY_IDS.tokenAdmin]: { x: 740, y: 70 },
  [MAP_ENTITY_IDS.vault]: { x: 740, y: 230 },
  [MAP_ENTITY_IDS.swapAdapter]: { x: 740, y: 390 },
  [MAP_ENTITY_IDS.router]: { x: 900, y: 540 },
  [MAP_ENTITY_IDS.token]: { x: 960, y: 70 },
};

/** The council column, top to bottom: the council account's seat, then Alice's and Bob's. */
const MEMBER_SLOTS: Point[] = [
  { x: 90, y: 120 },
  { x: 90, y: 300 },
  { x: 90, y: 480 },
];
const SUPPLIER_SLOT: Point = { x: 300, y: 590 };

export const DEMO_NAMES = {
  council: "Council account",
  alice: "Alice",
  bob: "Bob",
  supplier: "Supplier",
  token: "ACME",
  router: "SaucerSwap router",
  agent: "Co-signing agent",
} as const;

const CAPTIONS: Partial<Record<string, string>> = {
  [MAP_ENTITY_IDS.tokenAdmin]: "pause and freeze key",
  [MAP_ENTITY_IDS.vault]: "holds the reserve",
  [MAP_ENTITY_IDS.swapAdapter]: "sells ℏ on SaucerSwap",
};

const AGENT: GhostNode = {
  id: "demo:co-signing-agent",
  label: DEMO_NAMES.agent,
  caption: "not a member yet",
  position: { x: 90, y: 620 },
  monogram: "AG",
};

/** Shown by the inspector when a demo node is selected; placeholders until the inspector exists. */
export const DEMO_INSPECTOR_COPY: Partial<Record<string, string>> = {
  [GOVERNANCE_ACCOUNT_NODE_ID]:
    "The treasury is its own account. It moves only when enough council members sign to meet its threshold.",
  [EXECUTOR_NODE_ID]: "Anyone with PROPOSER_ROLE can register a call here; only the treasury can run it.",
  [MAP_ENTITY_IDS.tokenAdmin]: "ACME's pause and freeze keys are this contract, which only listens to the registry.",
  [MAP_ENTITY_IDS.vault]: "Holds the reserve. An upgrade to v2 adds withdrawals.",
  [MAP_ENTITY_IDS.swapAdapter]: "Sells treasury HBAR on SaucerSwap, with a floor the council approves.",
  [MAP_ENTITY_IDS.router]: "Outside the system: the adapter calls it and it pays the treasury back.",
  [AGENT.id]: "Not a member yet. Adding it is a council rotation the current council approves.",
};

/** The demo accounts `yarn setup` writes; literal member expressions so Next.js inlines them. */
function demoAccountIds(): { alice?: string; bob?: string } {
  return {
    alice: process.env.NEXT_PUBLIC_DEMO_ACCOUNT_ALICE_ID || undefined,
    bob: process.env.NEXT_PUBLIC_DEMO_ACCOUNT_BOB_ID || undefined,
  };
}

/**
 * The seats in the order the council column shows them. Alice and Bob are proposers too, so their
 * keys come with the proposer list; the one remaining seat is the council account `yarn setup` was
 * given (`HEDERA_COUNCIL_ACCOUNT_ID`), named "Council account" — "You" once it is the one connected.
 */
function demoSeats({ nodes, proposers }: MapContext): { council?: string; alice?: string; bob?: string } {
  const ids = demoAccountIds();
  const seatOf = (accountId: string | undefined) => {
    const key = proposers.find(proposer => proposer.accountId === accountId)?.key;
    return key && nodes.some(node => node.id === memberNodeId(key)) ? memberNodeId(key) : undefined;
  };
  const alice = seatOf(ids.alice);
  const bob = seatOf(ids.bob);
  const others = nodes.filter(node => node.role === "member" && node.id !== alice && node.id !== bob);
  return { council: others.length === 1 ? others[0].id : undefined, alice, bob };
}

export const decorateDemoMap: MapDecorator = context => {
  const positions: Record<string, Point> = { ...FIXED_POSITIONS };
  const labels: Record<string, string> = {
    [MAP_ENTITY_IDS.token]: DEMO_NAMES.token,
    [MAP_ENTITY_IDS.router]: DEMO_NAMES.router,
  };
  const captions: Partial<Record<string, string>> = { ...CAPTIONS };

  const seats = demoSeats(context);
  const known = [seats.council, seats.alice, seats.bob].flatMap(nodeId => (nodeId ? [nodeId] : []));
  const others = context.nodes.filter(node => node.role === "member" && !known.includes(node.id));
  [...known, ...others.map(node => node.id)].forEach((nodeId, slot) => {
    if (MEMBER_SLOTS[slot]) positions[nodeId] = MEMBER_SLOTS[slot];
  });
  if (seats.council) {
    labels[seats.council] = DEMO_NAMES.council;
    captions[seats.council] = "proposer";
  }
  const coSigners = [
    [seats.alice, DEMO_NAMES.alice],
    [seats.bob, DEMO_NAMES.bob],
  ] as const;
  for (const [nodeId, name] of coSigners) {
    if (!nodeId) continue;
    labels[nodeId] = name;
    captions[nodeId] = "demo co-signer";
  }

  // `yarn setup` grants PROPOSER_ROLE to an account without a seat — the operator that ran it, so it
  // can open the seed proposal. It is real, but the demo's story is the council, so it is not drawn.
  const hiddenNodes = context.nodes.filter(node => node.role === "proposer").map(node => node.id);
  // Alice and Bob hold PROPOSER_ROLE too, but the demo tells them as co-signers: only the council
  // account's line to the registry is drawn.
  const hiddenEdges = coSigners.flatMap(([nodeId]) => (nodeId ? [edgeId(nodeId, EXECUTOR_NODE_ID)] : []));

  // The demo's only transfer pays the supplier, so the account a pending transfer names is it.
  const recipient = context.nodes.find(node => node.role === "external" && node.id !== MAP_ENTITY_IDS.router);
  if (recipient) {
    positions[recipient.id] = SUPPLIER_SLOT;
    labels[recipient.id] = DEMO_NAMES.supplier;
  }

  return {
    layout: { ...SIZE, positions, labels },
    captions,
    ghosts: [AGENT],
    hidden: { nodes: hiddenNodes, edges: hiddenEdges },
  };
};
