import { KEY_A, KEY_B, KEY_C, MAP_SNAPSHOT, pendingTransferTo } from "../mapFixtures";
import { composeMap } from "../mapModel";
import { DEMO_INSPECTOR_COPY, DEMO_NAMES, decorateDemoMap } from "./demoGraph";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GOVERNANCE_ACCOUNT_NODE_ID, externalNodeId, memberNodeId } from "~~/services/governance/graph";
import { MAP_ENTITY_IDS } from "~~/services/governance/graphEntities";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DEMO_ACCOUNT_ALICE_ID", "0.0.4102");
  vi.stubEnv("NEXT_PUBLIC_DEMO_ACCOUNT_BOB_ID", "0.0.4103");
});
afterEach(() => vi.unstubAllEnvs());

const labelOf = (map: ReturnType<typeof composeMap>, id: string) => map.graph.nodes.find(node => node.id === id)?.label;

describe("decorateDemoMap", () => {
  it("names Alice and Bob by the seats their demo accounts hold, and the remaining seat as yours", () => {
    const map = composeMap(MAP_SNAPSHOT, decorateDemoMap);
    expect(labelOf(map, memberNodeId(KEY_B))).toBe(DEMO_NAMES.alice);
    expect(labelOf(map, memberNodeId(KEY_C))).toBe(DEMO_NAMES.bob);
    expect(labelOf(map, memberNodeId(KEY_A))).toBe(DEMO_NAMES.you);
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
});
