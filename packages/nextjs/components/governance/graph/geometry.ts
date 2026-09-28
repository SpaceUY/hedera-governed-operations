/**
 * Shapes and paths of the map, in viewBox units. Edges run centre to centre and the nodes are drawn
 * over them with an opaque plate, so no edge has to know the outline of the node it ends at. The one
 * outline an edge does know is the treasury's, which an edge that does not end there goes around.
 */
import { GOVERNANCE_ACCOUNT_NODE_ID, type GraphEdge, type GraphNode, type Point } from "~~/services/governance/graph";

export const ACCOUNT_RADIUS = 28;
export const TREASURY_RADIUS = 58;
export const RING_RADIUS = 70;
export const TOKEN_RADIUS = 38;
export const CONTRACT_SIZE = { width: 176, height: 58 } as const;
/** How far outside a node's outline its keyboard focus ring sits. */
export const FOCUS_GAP = 6;

/** The treasury's outermost drawn circle: its signature ring plus the focus ring around it. */
export const TREASURY_OUTLINE = RING_RADIUS + FOCUS_GAP + 3;
/**
 * How close to the treasury's centre an edge that does not end there may pass: its outline plus a
 * margin, so an edge routed around it reads as going around rather than grazing it.
 */
export const TREASURY_KEEP_OUT = TREASURY_OUTLINE + 21;

export type Circle = { center: Point; radius: number };

/** One cubic Bézier after the point it starts from: two control points and its end. */
type Cubic = readonly [Point, Point, Point];

/** The path an edge draws, as cubic segments, and where its caption sits on it. */
export type EdgeRoute = { start: Point; curves: Cubic[]; middle: Point };

/**
 * Centre to centre, leaving and arriving horizontally, the way a signal crosses from one column of
 * the map to the next (a straight line when the ends are one above the other). When that would run
 * through `avoid`, the edge goes around it instead (`detour`).
 */
export function edgeRoute(from: Point, to: Point, avoid?: Circle): EdgeRoute {
  const middleX = (from.x + to.x) / 2;
  const direct: EdgeRoute = {
    start: from,
    curves: [[{ x: middleX, y: from.y }, { x: middleX, y: to.y }, to]],
    middle: { x: middleX, y: (from.y + to.y) / 2 },
  };
  if (!avoid || distanceFrom(direct, avoid.center) >= avoid.radius) return direct;
  return detour(from, to, avoid);
}

/**
 * A smooth curve through one waypoint on the keep-out circle, on the side of the straight line from
 * `from` to `to` that is nearer (over the top when the line runs through the centre), with a tangent
 * there parallel to that line — a Catmull-Rom spline through the three points, as two cubics.
 */
function detour(from: Point, to: Point, avoid: Circle): EdgeRoute {
  const chord = minus(to, from);
  const direction = scale(chord, 1 / Math.hypot(chord.x, chord.y));
  const alongChord = dot(minus(avoid.center, from), direction);
  const closest = plus(from, scale(direction, alongChord));
  const offset = minus(closest, avoid.center);
  const length = Math.hypot(offset.x, offset.y);
  const side = length > 0.5 ? scale(offset, 1 / length) : upwardNormalOf(direction);
  const waypoint = plus(avoid.center, scale(side, avoid.radius));
  const tangent = scale(chord, 1 / 6);

  return {
    start: from,
    curves: [
      [plus(from, scale(minus(waypoint, from), 1 / 3)), minus(waypoint, tangent), waypoint],
      [plus(waypoint, tangent), minus(to, scale(minus(to, waypoint), 1 / 3)), to],
    ],
    middle: waypoint,
  };
}

/**
 * Where an edge runs on the map, or null when an end is missing. An edge that does not end at the
 * treasury — a proposer's PROPOSER_ROLE arc, say — goes around it, so no line seems to pass through
 * the council: registering a proposal takes no signature of the council's.
 */
export function routeOnMap(edge: GraphEdge, nodesById: ReadonlyMap<string, GraphNode>): EdgeRoute | null {
  const from = nodesById.get(edge.from);
  const to = nodesById.get(edge.to);
  if (!from || !to) return null;
  const treasury = nodesById.get(GOVERNANCE_ACCOUNT_NODE_ID);
  const endsAtTreasury = edge.from === GOVERNANCE_ACCOUNT_NODE_ID || edge.to === GOVERNANCE_ACCOUNT_NODE_ID;
  const avoid = treasury && !endsAtTreasury ? { center: treasury.position, radius: TREASURY_KEEP_OUT } : undefined;
  return edgeRoute(from.position, to.position, avoid);
}

/** The `d` attribute of a route. */
export function routePath({ start, curves }: EdgeRoute): string {
  const segments = curves.map(points => `C ${points.map(({ x, y }) => `${round(x)} ${round(y)}`).join(", ")}`);
  return [`M ${round(start.x)} ${round(start.y)}`, ...segments].join(" ");
}

const SAMPLES_PER_CURVE = 32;

/** How near a route comes to a point, measured on points sampled along it. */
export function distanceFrom(route: EdgeRoute, point: Point): number {
  let nearest = Infinity;
  let start = route.start;
  for (const [first, second, end] of route.curves) {
    for (let step = 0; step <= SAMPLES_PER_CURVE; step++) {
      const sample = pointOnCubic([start, first, second, end], step / SAMPLES_PER_CURVE);
      nearest = Math.min(nearest, Math.hypot(sample.x - point.x, sample.y - point.y));
    }
    start = end;
  }
  return nearest;
}

function pointOnCubic([p0, p1, p2, p3]: readonly Point[], t: number): Point {
  const u = 1 - t;
  const weights = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return {
    x: weights[0] * p0.x + weights[1] * p1.x + weights[2] * p2.x + weights[3] * p3.x,
    y: weights[0] * p0.y + weights[1] * p1.y + weights[2] * p2.y + weights[3] * p3.y,
  };
}

/** Of the two normals of a direction, the one pointing up the screen (negative y). */
function upwardNormalOf({ x, y }: Point): Point {
  return x >= 0 ? { x: y, y: -x } : { x: -y, y: x };
}

const plus = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const minus = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: Point, factor: number): Point => ({ x: a.x * factor, y: a.y * factor });
const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;

/** The letter drawn inside an account's circle, or nothing when the name is an id rather than a word. */
export function monogramOf(label: string): string {
  const first = label.trim().charAt(0);
  return /\p{L}/u.test(first) ? first.toUpperCase() : "";
}

/** A flat-sided hexagon centred on the origin, the shape a token takes. */
export function hexagonPoints(radius: number): string {
  return Array.from({ length: 6 }, (_unused, corner) => {
    const angle = (Math.PI / 3) * corner;
    return `${round(radius * Math.cos(angle))},${round(radius * Math.sin(angle))}`;
  }).join(" ");
}

const round = (value: number): number => Math.round(value * 100) / 100;
