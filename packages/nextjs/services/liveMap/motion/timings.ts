/**
 * The choreography's timings, in milliseconds: one number per moment of a sequence. The stylesheet's
 * map animations (`styles/globals.css`) are written to the same numbers; the comets and the counting
 * figures read theirs from here.
 */
export const MOTION_MS = {
  proposerPulse: 900,
  registryFlash: 400,
  signaturePulse: 700,
  ringFill: 500,
  thresholdPause: 150,
  ringSnap: 260,
  comet: 1100,
  cometStagger: 480,
  arrive: 400,
  figures: 700,
  hold: 2600,
  relax: 800,
  /** Three shakes of 180 ms. */
  fail: 540,
  councilChanged: 400,
} as const;

/**
 * The map at rest: every node drifts on a loop of its own between 8 and 14 s, and the glow behind the
 * treasury breathes on a 40 s one.
 */
export const AMBIENT_MS = { driftMin: 8_000, driftMax: 14_000, glow: 40_000 } as const;

/** How long a comet takes to cross `hops` hops, one leaving every stagger. */
export const travelMs = (hops: number): number => MOTION_MS.comet + MOTION_MS.cometStagger * (hops - 1);
