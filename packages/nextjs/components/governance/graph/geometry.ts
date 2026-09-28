/**
 * Shapes and paths of the map, in viewBox units. Edges run centre to centre and the nodes are drawn
 * over them with an opaque plate, so no edge has to know the outline of the node it ends at.
 */
import type { Point } from "~~/services/governance/graph";

export const ACCOUNT_RADIUS = 28;
export const TREASURY_RADIUS = 58;
export const RING_RADIUS = 70;
export const TOKEN_RADIUS = 38;
export const CONTRACT_SIZE = { width: 176, height: 58 } as const;
/** How far outside a node's outline its keyboard focus ring sits. */
export const FOCUS_GAP = 6;

/**
 * A straight line when the ends are one above the other, otherwise a curve that leaves and arrives
 * horizontally, the way a signal crosses from one column of the map to the next.
 */
export function edgePath(from: Point, to: Point): string {
  if (Math.abs(to.x - from.x) < 1) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  const middleX = (from.x + to.x) / 2;
  return `M ${from.x} ${from.y} C ${middleX} ${from.y}, ${middleX} ${to.y}, ${to.x} ${to.y}`;
}

/** Where an edge's caption sits: the curve's own midpoint, which for this curve is the chord's. */
export function edgeMidpoint(from: Point, to: Point): Point {
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
}

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
