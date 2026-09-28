import { RING_RADIUS } from "./geometry";

/** Share of the circumference left empty between two segments, out of 100. */
const SEGMENT_GAP = 2;

/**
 * The approvals a proposal collected, as one segment per signature the rule asks for. It is progress
 * only: the rule itself ("2-of-3") is written next to it by the treasury, so an empty ring never
 * hides how many signatures are needed. Amber while collecting, mint once the threshold is met.
 */
export function SignatureRing({ threshold, signed }: { threshold: number; signed: number }) {
  const segment = 100 / threshold;
  const gap = threshold > 1 ? SEGMENT_GAP : 0;
  const filledClass = signed >= threshold ? "stroke-success" : "stroke-warning";

  return (
    <g aria-hidden="true" transform="rotate(-90)" data-signed={signed} data-threshold={threshold}>
      {Array.from({ length: threshold }, (_unused, index) => (
        <circle
          key={index}
          r={RING_RADIUS}
          pathLength={100}
          fill="none"
          strokeWidth={6}
          strokeDasharray={`${segment - gap} ${100 - segment + gap}`}
          strokeDashoffset={-segment * index}
          className={index < signed ? filledClass : "stroke-base-content/15"}
        />
      ))}
    </g>
  );
}
