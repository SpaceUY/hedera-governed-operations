import { TREASURY_OUTLINE, distanceFrom, routeOnMap } from "../geometry";
import { KEY_A, KEY_B, KEY_C, MAP_SNAPSHOT, MAP_SNAPSHOT_WITH_OPERATOR, pendingTransferTo } from "../mapFixtures";
import { composeMap } from "../mapModel";
import { DEMO_INSPECTOR_COPY, DEMO_NAMES, decorateDemoMap } from "./demoGraph";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXECUTOR_NODE_ID,
  GOVERNANCE_ACCOUNT_NODE_ID,
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
  it("names Alice and Bob by the seats their demo accounts hold; the council account keeps its id", () => {
    const map = composeMap(MAP_SNAPSHOT, decorateDemoMap);
    expect(labelOf(map, memberNodeId(KEY_B))).toBe(DEMO_NAMES.alice);
    expect(labelOf(map, memberNodeId(KEY_C))).toBe(DEMO_NAMES.bob);
    expect(labelOf(map, memberNodeId(KEY_A))).toBe("0.0.4101");
    expect(map.captions[memberNodeId(KEY_A)]).toBe("council account · proposer");
  });

  it("names the connected account's seat You, over a demo name too", () => {
    expect(labelOf(composeMap(MAP_SNAPSHOT, decorateDemoMap, "0.0.4101"), memberNodeId(KEY_A))).toBe("You");
    const asAlice = composeMap(MAP_SNAPSHOT, decorateDemoMap, "0.0.4102");
    expect(labelOf(asAlice, memberNodeId(KEY_B))).toBe("You");
    expect(labelOf(asAlice, memberNodeId(KEY_C))).toBe(DEMO_NAMES.bob);
  });

  it("names the one proposer without a seat the setup operator", () => {
    const map = composeMap(MAP_SNAPSHOT_WITH_OPERATOR, decorateDemoMap);
    expect(labelOf(map, proposerNodeId("0.0.4001"))).toBe(DEMO_NAMES.operator);
  });

  it("routes every PROPOSER_ROLE arc around the treasury, Alice's and Bob's included", () => {
    const { graph } = composeMap(MAP_SNAPSHOT_WITH_OPERATOR, decorateDemoMap);
    const nodesById = new Map(graph.nodes.map(node => [node.id, node]));
    const treasury = nodesById.get(GOVERNANCE_ACCOUNT_NODE_ID)?.position ?? { x: NaN, y: NaN };
    const arcs = graph.edges.filter(edge => edge.to === EXECUTOR_NODE_ID && edge.from !== GOVERNANCE_ACCOUNT_NODE_ID);

    expect(arcs.map(arc => arc.from)).toEqual(
      expect.arrayContaining([memberNodeId(KEY_B), memberNodeId(KEY_C), proposerNodeId("0.0.4001")]),
    );
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
    expect(map.graph.nodes.some(node => node.id === agent.id)).toBe(false);
    expect(map.graph.edges.some(edge => edge.from === agent.id || edge.to === agent.id)).toBe(false);
    expect(DEMO_INSPECTOR_COPY[agent.id]).toBeTruthy();
  });

  it("names the council's column and the contracts' row", () => {
    expect(composeMap(MAP_SNAPSHOT, decorateDemoMap).regions.map(({ label }) => label)).toEqual([
      "Council",
      "Contracts",
    ]);
  });
});
