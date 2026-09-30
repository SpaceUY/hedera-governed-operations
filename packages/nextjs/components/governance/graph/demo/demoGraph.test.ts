import { TREASURY_OUTLINE, distanceFrom, routeOnMap } from "../geometry";
import { KEY_A, KEY_B, KEY_C, MAP_SNAPSHOT, MAP_SNAPSHOT_WITH_OPERATOR, pendingTransferTo } from "../mapFixtures";
import { composeMap } from "../mapModel";
import { DEMO_NAMES, decorateDemoMap } from "./demoGraph";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphSnapshot } from "~~/services/liveMap/model/graph";
import {
  EXECUTOR_NODE_ID,
  GOVERNANCE_ACCOUNT_NODE_ID,
  RECIPIENT_STAND_IN_NODE_ID,
  edgeId,
  externalNodeId,
  memberNodeId,
  proposerNodeId,
} from "~~/services/liveMap/model/graph";
import { MAP_ENTITY_IDS } from "~~/services/liveMap/model/graphEntities";
import { world } from "~~/services/liveMap/motion/motionFixtures";
import type { PreviewContext } from "~~/services/liveMap/preview/kinds/previewKind";
import { previewFrameOf } from "~~/services/liveMap/preview/previewFrame";
import { type MapPreview, selectedPreviewOf, sketchPreviewOf } from "~~/services/liveMap/preview/previewSource";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DEMO_ACCOUNT_ALICE_ID", "0.0.4102");
  vi.stubEnv("NEXT_PUBLIC_DEMO_ACCOUNT_BOB_ID", "0.0.4103");
});
afterEach(() => vi.unstubAllEnvs());

const labelOf = (map: ReturnType<typeof composeMap>, id: string) => map.graph.nodes.find(node => node.id === id)?.label;

describe("decorateDemoMap", () => {
  it("names Alice and Bob by the seats their demo accounts hold, and the remaining seat the council account", () => {
    const map = composeMap(MAP_SNAPSHOT, decorateDemoMap);
    expect(labelOf(map, memberNodeId(KEY_B))).toBe(DEMO_NAMES.alice);
    expect(labelOf(map, memberNodeId(KEY_C))).toBe(DEMO_NAMES.bob);
    expect(labelOf(map, memberNodeId(KEY_A))).toBe(DEMO_NAMES.council);
    expect(map.captions[memberNodeId(KEY_A)]).toBe("proposer");
  });

  it("names the connected account's seat You, over a demo name too", () => {
    expect(
      labelOf(composeMap(MAP_SNAPSHOT, decorateDemoMap, { viewerAccountId: "0.0.4101" }), memberNodeId(KEY_A)),
    ).toBe("You");
    const asAlice = composeMap(MAP_SNAPSHOT, decorateDemoMap, { viewerAccountId: "0.0.4102" });
    expect(labelOf(asAlice, memberNodeId(KEY_B))).toBe("You");
    expect(labelOf(asAlice, memberNodeId(KEY_C))).toBe(DEMO_NAMES.bob);
  });

  it("leaves the proposer without a seat off the demo map, with its edge, which the generic map still draws", () => {
    const operator = proposerNodeId("0.0.4001");
    const touches = (edge: { from: string; to: string }) => edge.from === operator || edge.to === operator;

    const demo = composeMap(MAP_SNAPSHOT_WITH_OPERATOR, decorateDemoMap).graph;
    expect(demo.nodes.some(node => node.id === operator)).toBe(false);
    expect(demo.edges.some(touches)).toBe(false);

    const generic = composeMap(MAP_SNAPSHOT_WITH_OPERATOR).graph;
    expect(generic.nodes.some(node => node.id === operator)).toBe(true);
    expect(generic.edges.some(touches)).toBe(true);
  });

  it("draws only the council account's line to the registry, not Alice's or Bob's, which the generic map keeps", () => {
    const proposerLines = (map: ReturnType<typeof composeMap>) =>
      map.graph.edges
        .filter(edge => edge.to === EXECUTOR_NODE_ID && edge.from !== GOVERNANCE_ACCOUNT_NODE_ID)
        .map(edge => edge.from);

    const demo = composeMap(MAP_SNAPSHOT, decorateDemoMap);
    expect(proposerLines(demo)).toEqual([memberNodeId(KEY_A)]);
    expect(demo.graph.nodes.some(node => node.id === memberNodeId(KEY_B))).toBe(true);
    expect(demo.graph.nodes.some(node => node.id === memberNodeId(KEY_C))).toBe(true);

    expect(proposerLines(composeMap(MAP_SNAPSHOT)).sort()).toEqual(
      [memberNodeId(KEY_A), memberNodeId(KEY_B), memberNodeId(KEY_C)].sort(),
    );
  });

  it("routes the PROPOSER_ROLE arc it draws around the treasury", () => {
    const { graph } = composeMap(MAP_SNAPSHOT_WITH_OPERATOR, decorateDemoMap);
    const nodesById = new Map(graph.nodes.map(node => [node.id, node]));
    const treasury = nodesById.get(GOVERNANCE_ACCOUNT_NODE_ID)?.position ?? { x: NaN, y: NaN };
    const arcs = graph.edges.filter(edge => edge.to === EXECUTOR_NODE_ID && edge.from !== GOVERNANCE_ACCOUNT_NODE_ID);

    expect(arcs.map(arc => arc.from)).toEqual([memberNodeId(KEY_A)]);
    for (const arc of arcs) {
      const route = routeOnMap(arc, nodesById);
      expect(route && distanceFrom(route, treasury)).toBeGreaterThan(TREASURY_OUTLINE);
    }
  });

  it("falls back to the account id when the demo accounts are not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_ACCOUNT_ALICE_ID", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_ACCOUNT_BOB_ID", "");
    const map = composeMap(MAP_SNAPSHOT, decorateDemoMap);
    expect(labelOf(map, memberNodeId(KEY_B))).toBe("0.0.4102");
    expect(labelOf(map, memberNodeId(KEY_A))).toBe("0.0.4101");
  });

  it("places the hand-composed layout and names the token and the router", () => {
    const map = composeMap(MAP_SNAPSHOT, decorateDemoMap);
    expect(map.graph).toMatchObject({ width: 1020, height: 700 });
    expect(map.graph.nodes.find(node => node.id === GOVERNANCE_ACCOUNT_NODE_ID)?.position).toEqual({ x: 300, y: 300 });
    expect(labelOf(map, MAP_ENTITY_IDS.token)).toBe("ACME");
    expect(labelOf(map, MAP_ENTITY_IDS.router)).toBe("SaucerSwap router");
  });

  it("names the account a pending transfer pays as the supplier", () => {
    const map = composeMap({ ...MAP_SNAPSHOT, proposals: [pendingTransferTo("0.0.7000")] }, decorateDemoMap);
    expect(labelOf(map, externalNodeId("0.0.7000"))).toBe(DEMO_NAMES.supplier);
  });

  it("adds the co-signing agent as a ghost that no edge reaches", () => {
    const map = composeMap(MAP_SNAPSHOT, decorateDemoMap);
    const [agent] = map.ghosts;
    expect(agent.label).toBe(DEMO_NAMES.agent);
    expect(agent.monogram).toBe("AG");
    expect(map.graph.nodes.some(node => node.id === agent.id)).toBe(false);
    expect(map.graph.edges.some(edge => edge.from === agent.id || edge.to === agent.id)).toBe(false);
    expect(map.inspector.nodes[agent.id]).toBeUndefined();
  });

  it("gives the inspector its own words for the demo's contracts, co-signers and supplier", () => {
    const map = composeMap({ ...MAP_SNAPSHOT, proposals: [pendingTransferTo("0.0.7000")] }, decorateDemoMap);
    expect(map.inspector.nodes[MAP_ENTITY_IDS.tokenAdmin]).toContain("ACME");
    expect(map.inspector.edges[edgeId(EXECUTOR_NODE_ID, MAP_ENTITY_IDS.vault)]).toBe(
      "The vault accepts upgrades only from the registry.",
    );
    expect(map.inspector.nodes[externalNodeId("0.0.7000")]).toContain("native scheduled transfer");
    expect(map.inspector.edges[edgeId(memberNodeId(KEY_B), GOVERNANCE_ACCOUNT_NODE_ID)]).toBe(
      "Alice's key is one of the treasury's threshold keys; her signatures arrive along this line.",
    );
  });

  it("names the council's column and the contracts' row", () => {
    expect(composeMap(MAP_SNAPSHOT, decorateDemoMap).regions.map(({ label }) => label)).toEqual([
      "Council",
      "Contracts",
    ]);
  });
});

describe("decorateDemoMap with the co-signing agent's key", () => {
  const AGENT_KEY = "YWdlbnQ=";
  const OTHER_KEY = "ZGF2ZQ==";
  const GHOST_SLOT = { x: 90, y: 620 };
  const rotationTo = (memberKeys: string[]) =>
    ({
      kind: "councilRotation",
      accountId: MAP_SNAPSHOT.governanceAccountId,
      council: { threshold: 2, memberKeys },
    }) as const;
  const positionOf = (map: ReturnType<typeof composeMap>, id: string) =>
    map.graph.nodes.find(node => node.id === id)?.position;
  const seated = (memberKeys: string[]) => ({
    ...MAP_SNAPSHOT,
    council: { threshold: 2, memberKeys },
  });

  it("keeps the ghost while the agent is unconfigured or unread, and while its key is neither seated nor proposed", () => {
    expect(composeMap(MAP_SNAPSHOT, decorateDemoMap).ghosts).toHaveLength(1);
    expect(composeMap(MAP_SNAPSHOT, decorateDemoMap, { agentSeat: null }).ghosts).toHaveLength(1);
    const map = composeMap(MAP_SNAPSHOT, decorateDemoMap, { agentSeat: AGENT_KEY });
    expect(map.ghosts).toHaveLength(1);
    expect(map.graph.nodes.some(node => node.ref === AGENT_KEY)).toBe(false);
  });

  it("seats the agent a rotation proposes at the ghost's slot, named and lettered as the agent, with no ghost", () => {
    const map = composeMap(
      { ...MAP_SNAPSHOT, previewed: rotationTo([KEY_A, KEY_B, KEY_C, AGENT_KEY]) },
      decorateDemoMap,
      { agentSeat: AGENT_KEY },
    );
    const id = memberNodeId(AGENT_KEY);
    expect(positionOf(map, id)).toEqual(GHOST_SLOT);
    expect(labelOf(map, id)).toBe(DEMO_NAMES.agent);
    expect(map.monograms[id]).toBe("AG");
    expect(map.ghosts).toEqual([]);
    expect(map.graph.edges.some(edge => edge.id === edgeId(id, GOVERNANCE_ACCOUNT_NODE_ID))).toBe(true);
    expect(labelOf(map, memberNodeId(KEY_A))).toBe(DEMO_NAMES.council);
    expect(labelOf(map, memberNodeId(KEY_C))).toBe(DEMO_NAMES.bob);
  });

  it("draws a proposed agent in the ghost's tone captioned as not a member yet, and a seated one as a member", () => {
    const proposed = composeMap(
      { ...MAP_SNAPSHOT, previewed: rotationTo([KEY_A, KEY_B, KEY_C, AGENT_KEY]) },
      decorateDemoMap,
      { agentSeat: AGENT_KEY },
    );
    const id = memberNodeId(AGENT_KEY);
    expect(proposed.unseated).toEqual([id]);
    expect(proposed.captions[id]).toBe("not a member yet");
    expect(labelOf(proposed, id)).toBe(DEMO_NAMES.agent);

    const held = composeMap(seated([KEY_A, KEY_B, KEY_C, AGENT_KEY]), decorateDemoMap, { agentSeat: AGENT_KEY });
    expect(held.unseated).toEqual([]);
    expect(held.captions[id]).toBeUndefined();
  });

  it('names the seat the agent holds "You" without the agent\'s letters when the viewer is its account', () => {
    const snapshot = seated([KEY_A, KEY_B, KEY_C, AGENT_KEY]);
    const withAgent = { ...snapshot, proposers: [...snapshot.proposers, { accountId: "0.0.4200", key: AGENT_KEY }] };
    const map = composeMap(withAgent, decorateDemoMap, { agentSeat: AGENT_KEY, viewerAccountId: "0.0.4200" });
    const id = memberNodeId(AGENT_KEY);
    expect(labelOf(map, id)).toBe("You");
    expect(map.monograms[id]).toBeUndefined();
  });

  it("puts the seated agent at the ghost's slot instead of the autoLayout, and Bob and the council account keep theirs", () => {
    const map = composeMap(seated([KEY_A, KEY_B, KEY_C, AGENT_KEY]), decorateDemoMap, { agentSeat: AGENT_KEY });
    const id = memberNodeId(AGENT_KEY);
    expect(positionOf(map, id)).toEqual(GHOST_SLOT);
    expect(labelOf(map, id)).toBe(DEMO_NAMES.agent);
    expect(map.monograms[id]).toBe("AG");
    expect(map.ghosts).toEqual([]);
    expect(labelOf(map, memberNodeId(KEY_A))).toBe(DEMO_NAMES.council);
    expect(map.captions[memberNodeId(KEY_A)]).toBe("proposer");
    expect(labelOf(map, memberNodeId(KEY_C))).toBe(DEMO_NAMES.bob);
    expect(positionOf(map, memberNodeId(KEY_C))).toEqual({ x: 90, y: 480 });
  });

  it("leaves a fourth seat that is not the agent's to the autoLayout and its own name, and keeps the ghost", () => {
    const rotation = { ...MAP_SNAPSHOT, previewed: rotationTo([KEY_A, KEY_B, KEY_C, OTHER_KEY]) };
    for (const [snapshot, agentSeat] of [
      [rotation, AGENT_KEY],
      [rotation, null],
      [seated([KEY_A, KEY_B, KEY_C, OTHER_KEY]), AGENT_KEY],
    ] as const) {
      const map = composeMap(snapshot, decorateDemoMap, { agentSeat });
      const id = memberNodeId(OTHER_KEY);
      expect(positionOf(map, id)).not.toEqual(GHOST_SLOT);
      expect(positionOf(map, id)).toBeDefined();
      expect(labelOf(map, id)).toBe(labelOf(composeMap(snapshot), id));
      expect(map.monograms[id]).toBeUndefined();
      expect(map.ghosts).toHaveLength(1);
    }
  });

  it("never takes Bob's seat for the agent's, whatever key the agent was configured with", () => {
    const map = composeMap(MAP_SNAPSHOT, decorateDemoMap, { agentSeat: KEY_C });
    expect(labelOf(map, memberNodeId(KEY_C))).toBe(DEMO_NAMES.bob);
    expect(positionOf(map, memberNodeId(KEY_C))).toEqual({ x: 90, y: 480 });
  });
});

describe("decorateDemoMap's supplier", () => {
  const SUPPLIER_SLOT = { x: 300, y: 590 };
  const ALICE_ACCOUNT = "0.0.4102";
  const CONTEXT: PreviewContext = {
    council: MAP_SNAPSHOT.council,
    vaultReleaseOf: () => null,
    tokenOf: () => null,
  };
  const SHOWN = { ...world([], MAP_SNAPSHOT.council), proposers: MAP_SNAPSHOT.proposers };
  const payment = (recipient: string) => pendingTransferTo(recipient);
  const draftTo = (recipient: string): MapPreview => ({
    key: "draft:treasuryTransfer",
    operation: payment(recipient).operation as MapPreview["operation"],
    mode: "live",
    proposerAccountId: null,
    progress: null,
  });

  /** The demo map with `preview` drawn into it, and the frame the pane would show for it. */
  function shown(preview: MapPreview, snapshot: GraphSnapshot = MAP_SNAPSHOT) {
    const map = composeMap({ ...snapshot, previewed: preview.operation }, decorateDemoMap);
    return { map, frame: previewFrameOf(preview, { graph: map.graph, world: SHOWN, context: CONTEXT }) };
  }
  const nodeAt = (map: ReturnType<typeof composeMap>, id: string) => map.graph.nodes.find(node => node.id === id);
  const atSlot = (map: ReturnType<typeof composeMap>) =>
    map.graph.nodes.filter(node => node.position.x === SUPPLIER_SLOT.x && node.position.y === SUPPLIER_SLOT.y);

  it("is always drawn at its slot, named and explained like the other nodes, and nothing reaches it at rest", () => {
    const map = composeMap(MAP_SNAPSHOT, decorateDemoMap);
    expect(nodeAt(map, RECIPIENT_STAND_IN_NODE_ID)).toMatchObject({
      label: DEMO_NAMES.supplier,
      position: SUPPLIER_SLOT,
    });
    expect(map.inspector.nodes[RECIPIENT_STAND_IN_NODE_ID]).toContain("native scheduled transfer");
    expect(map.graph.edges.some(edge => edge.to === RECIPIENT_STAND_IN_NODE_ID)).toBe(false);
  });

  it("lights up for a picked payment, which would receive a payment", () => {
    const sketch = sketchPreviewOf(
      "treasuryTransfer",
      { governanceAccountId: MAP_SNAPSHOT.governanceAccountId, entities: MAP_SNAPSHOT.entities, agentSeat: null },
      null,
    );
    const { frame } = shown(sketch);
    expect(frame.phases).toEqual({ [edgeId(GOVERNANCE_ACCOUNT_NODE_ID, RECIPIENT_STAND_IN_NODE_ID)]: "preview" });
    expect(frame.labels).toEqual({ [RECIPIENT_STAND_IN_NODE_ID]: "would receive a payment" });
  });

  it("stands for an account the map does not have, and shows its id", () => {
    const { map, frame } = shown(draftTo("0.0.7000"));
    const recipient = externalNodeId("0.0.7000");
    expect(atSlot(map).map(node => node.id)).toEqual([recipient]);
    expect(nodeAt(map, recipient)?.label).toBe(DEMO_NAMES.supplier);
    expect(map.captions[recipient]).toBe("0.0.7000");
    expect(frame.labels).toEqual({ [recipient]: "would receive 40 ℏ" });
  });

  it("stays unlit when the payment goes to someone already on the map: that node is lit instead", () => {
    const { map, frame } = shown(draftTo(ALICE_ACCOUNT));
    const alice = memberNodeId(KEY_B);
    expect(nodeAt(map, alice)?.label).toBe(DEMO_NAMES.alice);
    expect(map.graph.nodes.some(node => node.id === externalNodeId(ALICE_ACCOUNT))).toBe(false);
    expect(frame.phases).toEqual({ [edgeId(GOVERNANCE_ACCOUNT_NODE_ID, alice)]: "preview" });
    expect(frame.labels).toEqual({ [alice]: "would receive 40 ℏ" });
    expect(frame.scope?.nodeIds).not.toContain(RECIPIENT_STAND_IN_NODE_ID);
  });

  it("stays unlit for a selected pending payment to someone on the map", () => {
    const pending = payment(ALICE_ACCOUNT);
    const selected = selectedPreviewOf(pending, 2) as MapPreview;
    const { map, frame } = shown(selected, { ...MAP_SNAPSHOT, proposals: [pending] });
    expect(nodeAt(map, RECIPIENT_STAND_IN_NODE_ID)?.label).toBe(DEMO_NAMES.supplier);
    expect(frame.labels).toEqual({ [memberNodeId(KEY_B)]: "would receive 40 ℏ" });
    expect(frame.scope?.nodeIds).not.toContain(RECIPIENT_STAND_IN_NODE_ID);
  });
});
