import { TREASURY_OUTLINE, distanceFrom, routeOnMap } from "../geometry";
import { KEY_A, KEY_B, KEY_C, MAP_SNAPSHOT, MAP_SNAPSHOT_WITH_OPERATOR, pendingTransferTo } from "../mapFixtures";
import { composeMap } from "../mapModel";
import { DEMO_NAMES, decorateDemoMap } from "./demoGraph";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXECUTOR_NODE_ID,
  GOVERNANCE_ACCOUNT_NODE_ID,
  edgeId,
  externalNodeId,
  memberNodeId,
  proposerNodeId,
} from "~~/services/liveMap/model/graph";
import { MAP_ENTITY_IDS } from "~~/services/liveMap/model/graphEntities";

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

describe("decorateDemoMap with the co-signing agent", () => {
  const AGENT_SEAT = "YWdlbnQ=";
  const seated = {
    ...MAP_SNAPSHOT,
    council: { threshold: 2, memberKeys: [...MAP_SNAPSHOT.council.memberKeys, AGENT_SEAT] },
  };
  const nodeOf = (map: ReturnType<typeof composeMap>, id: string) => map.graph.nodes.find(node => node.id === id);

  it("draws the agent as a ghost while the council does not hold its key", () => {
    expect(composeMap(MAP_SNAPSHOT, decorateDemoMap).ghosts.map(ghost => ghost.label)).toEqual([DEMO_NAMES.agent]);
    const unseated = composeMap(MAP_SNAPSHOT, decorateDemoMap, { agentSeat: AGENT_SEAT });
    expect(unseated.ghosts.map(ghost => ghost.label)).toEqual([DEMO_NAMES.agent]);
  });

  it("puts the seated agent where its ghost was, and drops the ghost", () => {
    const unseated = composeMap(MAP_SNAPSHOT, decorateDemoMap);
    const map = composeMap(seated, decorateDemoMap, { agentSeat: AGENT_SEAT });
    expect(map.ghosts).toEqual([]);
    expect(nodeOf(map, memberNodeId(AGENT_SEAT))).toMatchObject({
      label: DEMO_NAMES.agent,
      position: unseated.ghosts[0].position,
    });
  });

  it("still names the council account once the agent holds a seat beside it", () => {
    const map = composeMap(seated, decorateDemoMap, { agentSeat: AGENT_SEAT });
    expect(nodeOf(map, memberNodeId(KEY_A))?.label).toBe(DEMO_NAMES.council);
    expect(nodeOf(map, memberNodeId(KEY_B))?.label).toBe(DEMO_NAMES.alice);
    expect(nodeOf(map, memberNodeId(KEY_C))?.label).toBe(DEMO_NAMES.bob);
  });

  it("keeps Bob's name when the agent runs on Bob's key, and draws no ghost", () => {
    const map = composeMap(MAP_SNAPSHOT, decorateDemoMap, { agentSeat: KEY_C });
    expect(nodeOf(map, memberNodeId(KEY_C))?.label).toBe(DEMO_NAMES.bob);
    expect(map.ghosts).toEqual([]);
  });
});
