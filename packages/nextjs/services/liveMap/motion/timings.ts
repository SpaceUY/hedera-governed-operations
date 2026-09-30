/**
 * The choreography's timings, in milliseconds: the sequences, the comets and the counting figures
 * read theirs from here. A moment the stylesheet plays on its own — a plate's flash, a ring segment
 * filling, the shake — keeps its duration there (`styles/globals.css`). Where two things overlap, a
 * `…At` is how far into the first the second starts.
 */
export const MOTION_MS = {
  /** A proposer's pulse along its arc into the registry, which flashes most of the way through it. */
  proposerPulse: 900,
  registryFlashAt: 650,
  /** From the pulse leaving until the arc and the registry have settled. */
  proposed: 1100,
  /** A signature's pulse into the treasury; the ring grows the new segment before the pulse lands. */
  signaturePulse: 700,
  ringFillAt: 600,
  /** The beat before a threshold run, then the ring snapping full. */
  thresholdPause: 150,
  ringSnap: 260,
  /** Each hop of a run: one comet, the next leaving a stagger after the one before. */
  comet: 1100,
  cometStagger: 480,
  /** The target's flash as the run arrives; the figures count from the arrival too. */
  arrive: 400,
  figures: 700,
  /** From the arrival until the lit path relaxes, and the relax itself. */
  hold: 2600,
  relax: 800,
  /** After a failed run's target starts shaking, the comet heads back, last hop first. */
  retreatAt: 120,
  retreat: 700,
  retreatStagger: 300,
  councilChanged: 400,
} as const;

/** How long the comets of a failed run take to come back across `hops` hops. */
export const retreatMs = (hops: number): number => MOTION_MS.retreat + MOTION_MS.retreatStagger * (hops - 1);
