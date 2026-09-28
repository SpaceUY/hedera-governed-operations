import { KEY_A, KEY_B, MAP_SNAPSHOT, MAP_SNAPSHOT_WITH_OPERATOR } from "./mapFixtures";
import { AUTO_MAP_SIZE, type MapDecorator, composeMap, genericLabels, readingOrder } from "./mapModel";
import { describe, expect, it, vi } from "vitest";
import {
  EXECUTOR_NODE_ID,
  GOVERNANCE_ACCOUNT_NODE_ID,
  autoLayout,
  deriveGraphState,
  memberNodeId,
} from "~~/services/liveMap/model/graph";
import { MAP_ENTITY_IDS } from "~~/services/liveMap/model/graphEntities";

describe("genericLabels", () => {
  const { nodes } = deriveGraphState(MAP_SNAPSHOT);

  it("names the fixed points by role and the configured contracts by what they are", () => {
    const labels = genericLabels({ nodes, proposers: MAP_SNAPSHOT.proposers });
    expect(labels[GOVERNANCE_ACCOUNT_NODE_ID]).toBe("Treasury");
    expect(labels[EXECUTOR_NODE_ID]).toBe("Proposal registry");
    expect(labels[MAP_ENTITY_IDS.swapAdapter]).toBe("Swap adapter");
  });

  it("names a seat by the proposer account holding its key, and by the key otherwise", () => {
    const labels = genericLabels({ nodes, proposers: MAP_SNAPSHOT.proposers.slice(1) });
    expect(labels[memberNodeId(KEY_B)]).toBe("0.0.4102");
    expect(labels[memberNodeId(KEY_A)]).toBe("Member YWxpY2…");
  });
});

describe("composeMap", () => {
  it("places every node by role and names it generically when there is no decoration", () => {
    const { graph, captions, ghosts, regions, inspector } = composeMap(MAP_SNAPSHOT);
    const fallback = autoLayout(graph.nodes, AUTO_MAP_SIZE);

    for (const node of graph.nodes) expect(node.position).toEqual(fallback[node.id]);
    expect(graph.nodes.find(node => node.id === GOVERNANCE_ACCOUNT_NODE_ID)?.label).toBe("Treasury");
    expect(graph.nodes.find(node => node.id === MAP_ENTITY_IDS.token)?.label).toBe("0.0.6000");
    expect(captions).toEqual({});
    expect(ghosts).toEqual([]);
    expect(regions).toEqual([]);
    expect(inspector).toEqual({ nodes: {}, edges: {} });
  });

  it("hands the decorator the nodes as the ledger produced them, and lets its names win", () => {
    const decorate = vi.fn<MapDecorator>(() => ({
      layout: {
        width: 400,
        height: 300,
        positions: { [GOVERNANCE_ACCOUNT_NODE_ID]: { x: 10, y: 20 } },
        labels: { [MAP_ENTITY_IDS.token]: "TKN" },
      },
      captions: { [MAP_ENTITY_IDS.token]: "a token" },
    }));
    const { graph, captions } = composeMap(MAP_SNAPSHOT, decorate);

    expect(decorate.mock.calls[0][0].nodes.map(node => node.id)).toContain(memberNodeId(KEY_A));
    expect(graph).toMatchObject({ width: 400, height: 300 });
    expect(graph.nodes.find(node => node.id === GOVERNANCE_ACCOUNT_NODE_ID)?.position).toEqual({ x: 10, y: 20 });
    expect(graph.nodes.find(node => node.id === MAP_ENTITY_IDS.token)?.label).toBe("TKN");
    // A name the decoration leaves out keeps its generic one.
    expect(graph.nodes.find(node => node.id === EXECUTOR_NODE_ID)?.label).toBe("Proposal registry");
    expect(captions[MAP_ENTITY_IDS.token]).toBe("a token");
  });
});

describe("composeMap with a connected account", () => {
  const labelOf = (map: ReturnType<typeof composeMap>, id: string) =>
    map.graph.nodes.find(node => node.id === id)?.label;

  it("names the seat whose key the connected proposer holds You, and no other", () => {
    const map = composeMap(MAP_SNAPSHOT, undefined, "0.0.4102");
    expect(labelOf(map, memberNodeId(KEY_B))).toBe("You");
    expect(labelOf(map, memberNodeId(KEY_A))).toBe("0.0.4101");
  });

  it("names nobody You without a wallet, or for an account that holds no seat", () => {
    for (const viewer of [undefined, null, "0.0.9999", "0.0.4001"]) {
      const map = composeMap(MAP_SNAPSHOT_WITH_OPERATOR, undefined, viewer);
      expect(map.graph.nodes.some(node => node.label === "You")).toBe(false);
    }
  });
});

describe("readingOrder", () => {
  it("reads left to right, then top to bottom", () => {
    const items = [
      { id: "right", position: { x: 9, y: 0 } },
      { id: "lower-left", position: { x: 1, y: 5 } },
      { id: "upper-left", position: { x: 1, y: 1 } },
    ];
    expect(readingOrder(items)).toEqual(["upper-left", "lower-left", "right"]);
  });
});
