import {
  TREASURY_KEEP_OUT,
  TREASURY_OUTLINE,
  distanceFrom,
  edgeRoute,
  hexagonPoints,
  monogramOf,
  routeOnMap,
  routePath,
} from "./geometry";
import { MAP_SNAPSHOT_WITH_OPERATOR } from "./mapFixtures";
import { composeMap } from "./mapModel";
import { nextFocusIndex } from "./useRovingFocus";
import { describe, expect, it } from "vitest";
import { EXECUTOR_NODE_ID, GOVERNANCE_ACCOUNT_NODE_ID, memberNodeId } from "~~/services/liveMap/model/graph";

const TREASURY = { x: 300, y: 300 };
const KEEP_OUT = { center: TREASURY, radius: TREASURY_KEEP_OUT };

describe("edgeRoute", () => {
  it("draws a straight line between two nodes one above the other", () => {
    expect(routePath(edgeRoute({ x: 300, y: 372 }, { x: 300, y: 560 }))).toBe("M 300 372 C 300 372, 300 560, 300 560");
  });

  it("leaves and arrives horizontally between columns, with the caption at the curve's midpoint", () => {
    const route = edgeRoute({ x: 490, y: 170 }, { x: 740, y: 70 });
    expect(routePath(route)).toBe("M 490 170 C 615 170, 615 70, 740 70");
    expect(route.middle).toEqual({ x: 615, y: 120 });
  });

  it("keeps that curve when it already clears the circle to avoid", () => {
    const route = edgeRoute({ x: 90, y: 120 }, { x: 490, y: 170 }, KEEP_OUT);
    expect(route.curves).toHaveLength(1);
  });

  it("goes around the circle on the nearer side, with the caption where it passes", () => {
    const [from, to] = [
      { x: 90, y: 300 },
      { x: 490, y: 170 },
    ];
    expect(distanceFrom(edgeRoute(from, to), TREASURY)).toBeLessThan(TREASURY_OUTLINE);

    const route = edgeRoute(from, to, KEEP_OUT);
    expect(distanceFrom(route, TREASURY)).toBeGreaterThanOrEqual(TREASURY_OUTLINE);
    expect(route.middle.y).toBeLessThan(TREASURY.y);
    expect(Math.hypot(route.middle.x - TREASURY.x, route.middle.y - TREASURY.y)).toBeCloseTo(TREASURY_KEEP_OUT);
  });

  it("goes over the top when the line runs straight through the centre", () => {
    const route = edgeRoute({ x: 100, y: 300 }, { x: 500, y: 300 }, KEEP_OUT);
    expect(route.middle).toEqual({ x: 300, y: 300 - TREASURY_KEEP_OUT });
  });

  it("passes the waypoint smoothly, parallel to the line it replaces, and never doubles back", () => {
    const [from, to] = [
      { x: 90, y: 300 },
      { x: 490, y: 170 },
    ];
    const [first, second] = edgeRoute(from, to, KEEP_OUT).curves;
    const across = { x: second[0].x - first[1].x, y: second[0].y - first[1].y };
    expect(across.x * (to.y - from.y) - across.y * (to.x - from.x)).toBeCloseTo(0);
    expect(across.x).toBeGreaterThan(0);

    const route = edgeRoute(from, to, KEEP_OUT);
    const xs = route.curves.flatMap(points => points.map(({ x }) => x));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(from.x);
    expect(Math.max(...xs)).toBeLessThanOrEqual(to.x);
  });

  it("goes under when the line passes below the centre", () => {
    const route = edgeRoute({ x: 90, y: 480 }, { x: 490, y: 170 }, KEEP_OUT);
    expect(route.middle.y).toBeGreaterThan(TREASURY.y);
    expect(distanceFrom(route, TREASURY)).toBeGreaterThanOrEqual(TREASURY_OUTLINE);
  });
});

describe("routeOnMap", () => {
  it("routes every PROPOSER_ROLE arc of the role-based layout around the treasury", () => {
    const { graph } = composeMap(MAP_SNAPSHOT_WITH_OPERATOR);
    const nodesById = new Map(graph.nodes.map(node => [node.id, node]));
    const treasury = nodesById.get(GOVERNANCE_ACCOUNT_NODE_ID)?.position ?? { x: NaN, y: NaN };
    const arcs = graph.edges.filter(edge => edge.to === EXECUTOR_NODE_ID && edge.from !== GOVERNANCE_ACCOUNT_NODE_ID);

    expect(arcs).toHaveLength(4);
    for (const arc of arcs) {
      const route = routeOnMap(arc, nodesById);
      expect(route && distanceFrom(route, treasury)).toBeGreaterThan(TREASURY_OUTLINE);
    }
  });

  it("lets an edge that ends at the treasury run straight into it", () => {
    const { graph } = composeMap(MAP_SNAPSHOT_WITH_OPERATOR);
    const nodesById = new Map(graph.nodes.map(node => [node.id, node]));
    const seat = graph.edges.find(
      edge =>
        edge.from === memberNodeId(MAP_SNAPSHOT_WITH_OPERATOR.council.memberKeys[0]) &&
        edge.to === GOVERNANCE_ACCOUNT_NODE_ID,
    );
    const [from, to] = [nodesById.get(seat?.from ?? "")?.position, nodesById.get(GOVERNANCE_ACCOUNT_NODE_ID)?.position];
    expect(seat && from && to && routeOnMap(seat, nodesById)).toEqual(from && to && edgeRoute(from, to));
  });

  it("lets an edge that starts at the treasury run straight out of it", () => {
    const { graph } = composeMap(MAP_SNAPSHOT_WITH_OPERATOR);
    const nodesById = new Map(graph.nodes.map(node => [node.id, node]));
    const call = graph.edges.find(edge => edge.from === GOVERNANCE_ACCOUNT_NODE_ID && edge.to === EXECUTOR_NODE_ID);
    const [from, to] = [nodesById.get(GOVERNANCE_ACCOUNT_NODE_ID)?.position, nodesById.get(EXECUTOR_NODE_ID)?.position];
    expect(call && from && to && routeOnMap(call, nodesById)).toEqual(from && to && edgeRoute(from, to));
  });
});

describe("monogramOf", () => {
  it("takes the first letter of a name", () => {
    expect(monogramOf("alice")).toBe("A");
    expect(monogramOf("You")).toBe("Y");
  });

  it("draws nothing for a name that is an id", () => {
    expect(monogramOf("0.0.4100")).toBe("");
  });
});

describe("hexagonPoints", () => {
  it("has six corners on the radius, flat at the top", () => {
    const corners = hexagonPoints(38).split(" ");
    expect(corners).toHaveLength(6);
    expect(corners[0]).toBe("38,0");
    expect(corners[3]).toBe("-38,0");
  });
});

describe("nextFocusIndex", () => {
  it("moves forward and back with the arrow keys, wrapping at the ends", () => {
    expect(nextFocusIndex(0, "ArrowRight", 3)).toBe(1);
    expect(nextFocusIndex(2, "ArrowDown", 3)).toBe(0);
    expect(nextFocusIndex(0, "ArrowLeft", 3)).toBe(2);
    expect(nextFocusIndex(1, "ArrowUp", 3)).toBe(0);
  });

  it("jumps to the ends with Home and End", () => {
    expect(nextFocusIndex(1, "Home", 3)).toBe(0);
    expect(nextFocusIndex(1, "End", 3)).toBe(2);
  });

  it("ignores every other key, and an empty map", () => {
    expect(nextFocusIndex(1, "Tab", 3)).toBeNull();
    expect(nextFocusIndex(0, "ArrowRight", 0)).toBeNull();
  });
});
