/**
 * Demo only: the hand-composed Live Map of the ACME treasury that `yarn setup` creates — where each
 * node sits, the names Alice, Bob and "Setup operator", the co-signing agent that is not a member
 * yet, and the inspector's words for them. The seat of whoever is connected is named "You" by the
 * map itself, not here. Delete this folder and the `decorate={decorateDemoMap}`
 * prop that passes it: the map falls back to placing nodes by role and naming them by id.
 */
import type { GhostNode, InspectorCopy, MapContext, MapDecorator, MapRegion } from "../mapModel";
import {
  EXECUTOR_NODE_ID,
  GOVERNANCE_ACCOUNT_NODE_ID,
  type Point,
  edgeId,
  memberNodeId,
} from "~~/services/liveMap/model/graph";
import { MAP_ENTITY_IDS } from "~~/services/liveMap/model/graphEntities";

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
/** Proposers without a seat — the operator `yarn setup` grants the role to — along the top. */
const PROPOSER_ROW = { x: 300, y: 50, step: 170 } as const;

export const DEMO_NAMES = {
  alice: "Alice",
  bob: "Bob",
  operator: "Setup operator",
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

/** The two areas of the layout: the council's column down the left, the contracts' across the top. */
const REGIONS: MapRegion[] = [
  { label: "Council", position: { x: 24, y: 300 }, orientation: "vertical" },
  { label: "Contracts", position: { x: 740, y: 22 }, orientation: "horizontal" },
];

const AGENT: GhostNode = {
  id: "demo:co-signing-agent",
  label: DEMO_NAMES.agent,
  caption: "not a member yet",
  position: { x: 90, y: 620 },
};

/**
 * What the inspector says about this layout's nodes and edges where the role's words are too general:
 * that the vault takes upgrades, that the token is ACME. The co-signing agent has none yet — what it
 * signs and why is still being decided — so the inspector shows it with the words for any ghost.
 */
const INSPECTOR_NODES: Partial<Record<string, string>> = {
  [MAP_ENTITY_IDS.vault]:
    "Holds the treasury's HBAR reserve. v1 takes deposits and cannot withdraw; v2 adds withdrawals. It accepts upgrades only from the registry.",
  [MAP_ENTITY_IDS.tokenAdmin]:
    "This contract is the ACME token's pause and freeze key. That is why pausing needs the council: the key is not a person, it is a contract that only listens to the registry.",
  [MAP_ENTITY_IDS.token]:
    "The company token, native to Hedera's Token Service. Its pause and freeze keys point at a contract — the Token admin — so no single person can pause it.",
  [MAP_ENTITY_IDS.swapAdapter]:
    "Sells treasury HBAR for an HTS token on SaucerSwap and settles the proceeds straight back to the treasury. It accepts calls only from the registry.",
  [MAP_ENTITY_IDS.router]: "The DEX. It sits outside this system: nothing here controls it, the adapter only calls it.",
};

const INSPECTOR_EDGES: Partial<Record<string, string>> = {
  [edgeId(EXECUTOR_NODE_ID, MAP_ENTITY_IDS.vault)]: "The vault accepts upgrades only from the registry.",
  [edgeId(EXECUTOR_NODE_ID, MAP_ENTITY_IDS.tokenAdmin)]: "The Token admin accepts calls only from the registry.",
  [edgeId(EXECUTOR_NODE_ID, MAP_ENTITY_IDS.swapAdapter)]: "The swap adapter accepts calls only from the registry.",
  [edgeId(MAP_ENTITY_IDS.tokenAdmin, MAP_ENTITY_IDS.token)]:
    "The token's pause key is this contract. Pausing is a contract call, so it needs the council.",
  [edgeId(MAP_ENTITY_IDS.swapAdapter, MAP_ENTITY_IDS.router)]: "The adapter calls SaucerSwap's router to sell HBAR.",
  [edgeId(MAP_ENTITY_IDS.vault, GOVERNANCE_ACCOUNT_NODE_ID)]:
    "Where the money is: the treasury's HBAR reserve lives in the vault.",
  [edgeId(MAP_ENTITY_IDS.router, GOVERNANCE_ACCOUNT_NODE_ID)]:
    "Where the money goes: swap proceeds settle straight back to the treasury.",
};

type CoSigner = { name: string; subject: "she" | "he"; possessive: "her" | "his" };

const ALICE: CoSigner = { name: DEMO_NAMES.alice, subject: "she", possessive: "her" };
const BOB: CoSigner = { name: DEMO_NAMES.bob, subject: "he", possessive: "his" };

/** What the inspector says about a demo co-signer's seat and the line from it into the treasury. */
function coSignerCopy(nodeId: string, { name, subject, possessive }: CoSigner): InspectorCopy {
  return {
    nodes: {
      [nodeId]: `A demo co-signer created by the setup script, which keeps ${possessive} key on this machine, testnet only. ${name} is in no contract: ${subject} is one of the keys inside the treasury account's ThresholdKey, read from the Mirror Node.`,
    },
    edges: {
      [edgeId(nodeId, GOVERNANCE_ACCOUNT_NODE_ID)]:
        `${name}'s key is one of the treasury's threshold keys; ${possessive} signatures arrive along this line.`,
    },
  };
}

const SUPPLIER_COPY =
  "An outside account. The treasury pays it with a native scheduled transfer: same threshold, but no contract, no registry entry and no event.";

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
 * given (`HEDERA_COUNCIL_ACCOUNT_ID`), which keeps its account id as its name.
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
  if (seats.council) captions[seats.council] = "council account · proposer";
  const inspector: InspectorCopy = { nodes: { ...INSPECTOR_NODES }, edges: { ...INSPECTOR_EDGES } };
  const coSigners = [
    [seats.alice, ALICE],
    [seats.bob, BOB],
  ] as const;
  for (const [nodeId, coSigner] of coSigners) {
    if (!nodeId) continue;
    labels[nodeId] = coSigner.name;
    captions[nodeId] = "demo co-signer";
    const copy = coSignerCopy(nodeId, coSigner);
    Object.assign(inspector.nodes, copy.nodes);
    Object.assign(inspector.edges, copy.edges);
  }

  const unseated = context.nodes.filter(node => node.role === "proposer");
  unseated.forEach((node, index) => {
    positions[node.id] = { x: PROPOSER_ROW.x + PROPOSER_ROW.step * index, y: PROPOSER_ROW.y };
  });
  // `yarn setup` grants PROPOSER_ROLE to one account without a seat: the operator that ran it.
  if (unseated.length === 1) labels[unseated[0].id] = DEMO_NAMES.operator;

  // The demo's only transfer pays the supplier, so the account a pending transfer names is it.
  const recipient = context.nodes.find(node => node.role === "external" && node.id !== MAP_ENTITY_IDS.router);
  if (recipient) {
    positions[recipient.id] = SUPPLIER_SLOT;
    labels[recipient.id] = DEMO_NAMES.supplier;
    inspector.nodes[recipient.id] = SUPPLIER_COPY;
  }

  return { layout: { ...SIZE, positions, labels }, captions, ghosts: [AGENT], regions: REGIONS, inspector };
};
