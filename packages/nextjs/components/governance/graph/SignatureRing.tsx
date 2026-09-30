import { RING_RADIUS } from "./geometry";
import { TONE_STROKE } from "./nodeProps";
import type { NodeTone } from "~~/services/liveMap/motion/frame";

/** Share of the circumference left empty between two segments, out of 100. */
const SEGMENT_GAP = 2;

type SignatureRingProps = {
  threshold: number;
  signed: number;
  /** Set for the moment the threshold is reached: the ring overshoots and settles. */
  snap?: boolean;
  /** The colour of the filled segments while an operation plays; the primary colour otherwise. */
  tone?: NodeTone | null;
};

/**
 * The approvals a proposal collected, as one segment per signature the rule asks for. It is progress
 * only: the rule itself ("2-of-3") is written next to it by the treasury, so an empty ring never
 * hides how many signatures are needed. Violet at rest, amber while a signature arrives, mint once
 * the threshold has run and coral when the run reverted. A segment fills by growing along its track
 * (`map-ring-fill` in the stylesheet), not by appearing.
 */
export function SignatureRing({ threshold, signed, snap = false, tone = null }: SignatureRingProps) {
  const segment = 100 / threshold;
  const length = segment - (threshold > 1 ? SEGMENT_GAP : 0);
  const filledClass = tone ? TONE_STROKE[tone] : "stroke-primary";

  return (
    <g
      aria-hidden="true"
      data-signed={signed}
      data-threshold={threshold}
      className={snap ? "origin-center transform-fill motion-safe:animate-map-ring-snap" : undefined}
    >
      <g transform="rotate(-90)">
        {Array.from({ length: threshold }, (_unused, index) => (
          <g key={index}>
            <circle
              r={RING_RADIUS}
              pathLength={100}
              fill="none"
              strokeWidth={6}
              strokeDasharray={`${length} ${100 - length}`}
              strokeDashoffset={-segment * index}
              className="stroke-base-content/15"
            />
            <circle
              r={RING_RADIUS}
              pathLength={100}
              fill="none"
              strokeWidth={6}
              strokeDashoffset={-segment * index}
              data-filled={index < signed}
              className={`map-ring-fill ${filledClass}`}
              style={{ strokeDasharray: `${index < signed ? length : 0} 100` }}
            />
          </g>
        ))}
      </g>
    </g>
  );
}
