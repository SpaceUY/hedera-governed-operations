import { AMBIENT_MS } from "./timings";

/** The golden ratio's fraction: stepping by it spreads any set of seeds evenly over a loop. */
const SPREAD = 0.618_033_988_75;

/** A small whole number from a node id, the same on every render and every machine. */
function seedOf(id: string): number {
  let seed = 0;
  for (const character of id) seed = (seed * 31 + character.charCodeAt(0)) % 10_007;
  return seed;
}

/**
 * The drift of one node: a period between `AMBIENT_MS.driftMin` and `driftMax` and a phase within
 * it, both its own and both taken from its id, so the map breathes without its nodes moving in step,
 * and a node keeps its drift when others join or leave the map.
 */
export function driftOf(nodeId: string): { periodMs: number; phaseMs: number } {
  const seed = seedOf(nodeId);
  const span = AMBIENT_MS.driftMax - AMBIENT_MS.driftMin;
  const periodMs = Math.round(AMBIENT_MS.driftMin + ((seed * SPREAD) % 1) * span);
  const phaseMs = Math.round(((seed * SPREAD * SPREAD) % 1) * periodMs);
  return { periodMs, phaseMs };
}
