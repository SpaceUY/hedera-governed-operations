/**
 * Demo only: the hand-composed Live Map of the ACME treasury that `yarn setup` creates — where each
 * node sits, the names "Council account", Alice and Bob, the co-signing agent that is not a member
 * yet — or, once a rotation proposes its key or the council holds it, seated at the same slot — the
 * Supplier every transfer pays, and the inspector's words for them. The seat of whoever is connected is named "You" by the
 * map itself, not here. Delete this folder and the `decorate={decorateDemoMap}`
 * prop that passes it: the map falls back to placing nodes by role and naming them by id.
 */
import {
  type GhostNode,
  type InspectorCopy,
  type MapContext,
  type MapDecorator,
  type MapRegion,
  isIntroducedAccount,
} from "../mapModel";
import { isValidEntityId } from "@sh/core/mirror";
import {
  EXECUTOR_NODE_ID,
  GOVERNANCE_ACCOUNT_NODE_ID,
  type Point,
  RECIPIENT_STAND_IN_NODE_ID,
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
  monogram: "AG",
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
 * given (`HEDERA_COUNCIL_ACCOUNT_ID`), named "Council account" — "You" once it is the one connected.
 * The co-signing agent's seat, when the council holds it or a rotation proposes it, is none of these.
 */
function demoSeats({ nodes, proposers, agentSeat }: MapContext): {
  council?: string;
  alice?: string;
  bob?: string;
  agent?: string;
} {
  const ids = demoAccountIds();
  const seatOf = (accountId: string | undefined) => {
    const key = proposers.find(proposer => proposer.accountId === accountId)?.key;
    return key && nodes.some(node => node.id === memberNodeId(key)) ? memberNodeId(key) : undefined;
  };
  const alice = seatOf(ids.alice);
  const bob = seatOf(ids.bob);
  // The agent has a seat of its own: whichever of Alice's and Bob's keys it was configured with, theirs stay theirs.
  const agent = nodes.find(
    node => node.role === "member" && node.ref === agentSeat && node.id !== alice && node.id !== bob,
  )?.id;
  const others = nodes.filter(
    node => node.role === "member" && node.id !== alice && node.id !== bob && node.id !== agent,
  );
  return { council: others.length === 1 ? others[0].id : undefined, alice, bob, agent };
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
  const others = context.nodes.filter(
    node => node.role === "member" && !known.includes(node.id) && node.id !== seats.agent,
  );
  [...known, ...others.map(node => node.id)].forEach((nodeId, slot) => {
    if (MEMBER_SLOTS[slot]) positions[nodeId] = MEMBER_SLOTS[slot];
  });
  const monograms: Partial<Record<string, string>> = {};
  const unseated: string[] = [];
  // The agent's seat, held or proposed, takes the place its ghost waits in, and the ghost steps aside.
  if (seats.agent) {
    positions[seats.agent] = AGENT.position;
    labels[seats.agent] = DEMO_NAMES.agent;
    monograms[seats.agent] = AGENT.monogram;
    // A proposed seat is not a member yet: it keeps the ghost's slot and look until the council holds it.
    if (context.agentSeat === null || !context.memberKeys.includes(context.agentSeat)) {
      unseated.push(seats.agent);
      captions[seats.agent] = AGENT.caption;
    }
  }
  if (seats.council) {
    labels[seats.council] = DEMO_NAMES.council;
    captions[seats.council] = "proposer";
  }
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

  // `yarn setup` grants PROPOSER_ROLE to an account without a seat — the operator that ran it, so it
  // can open the seed proposal. It is real, but the demo's story is the council, so it is not drawn.
  const hiddenNodes = context.nodes.filter(node => node.role === "proposer").map(node => node.id);
  // Alice and Bob hold PROPOSER_ROLE too, but the demo tells them as co-signers: only the council
  // account's line to the registry is drawn.
  const hiddenEdges = coSigners.flatMap(([nodeId]) => (nodeId ? [edgeId(nodeId, EXECUTOR_NODE_ID)] : []));

  // The Supplier is always drawn, as the stand-in for whoever a transfer pays. An account a proposal or
  // the draft pays that the map has no node for takes its place, name and words, with its id underneath,
  // so exactly one Supplier is drawn and it is the real one. One the map has — Alice, Bob, the
  // treasury — is paid on its own node, and the Supplier stays unlit. The co-signing agent's account
  // is paid under the agent's name, and an alias is never taken for the Supplier: it may be anyone's.
  const { agentAccountId } = context;
  const introduced = context.nodes.filter(node => node.role === "external" && isIntroducedAccount(node));
  const recipient = introduced.find(node => isValidEntityId(node.ref) && node.ref !== agentAccountId);
  const agentRecipient = introduced.find(node => node.ref === agentAccountId);
  if (agentRecipient) labels[agentRecipient.id] = DEMO_NAMES.agent;
  const supplier = recipient?.id ?? RECIPIENT_STAND_IN_NODE_ID;
  positions[supplier] = SUPPLIER_SLOT;
  labels[supplier] = DEMO_NAMES.supplier;
  inspector.nodes[supplier] = SUPPLIER_COPY;
  if (recipient) {
    captions[recipient.id] = recipient.ref;
    hiddenNodes.push(RECIPIENT_STAND_IN_NODE_ID);
  }

  return {
    layout: { ...SIZE, positions, labels },
    captions,
    monograms,
    unseated,
    ghosts: seats.agent ? [] : [AGENT],
    regions: REGIONS,
    inspector,
    hidden: { nodes: hiddenNodes, edges: hiddenEdges },
    recipientStandIn: true,
  };
};
