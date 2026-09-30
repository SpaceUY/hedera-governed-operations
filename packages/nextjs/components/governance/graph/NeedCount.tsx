import { useId } from "react";
import { MAP_LABELS } from "./copy";

/** One digit's line, in viewBox units; the column moves by this much per signature. */
const ROLL_STEP = 20;
/** Where the digit and the words sit under the rule, as the prototype sets them. */
const DIGIT_X = -44;
const WORDS_X = -34;

/**
 * "2 more needed" under the treasury's rule, the digit rolling to its new value (`map-roll`, 250 ms,
 * none under reduced motion). The treasury's accessible name says it in words, so this is hidden
 * from screen readers.
 */
export function NeedCount({ need, y }: { need: number; y: number }) {
  const clipId = `map-need-${useId().replace(/[^\w-]/g, "")}`;
  const digits = Array.from({ length: Math.max(need, 9) + 1 }, (_unused, digit) => digit);

  return (
    <g aria-hidden="true">
      <clipPath id={clipId}>
        <rect x={DIGIT_X - 10} y={y - 15} width={20} height={ROLL_STEP} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <g className="map-roll" style={{ transform: `translateY(${-need * ROLL_STEP}px)` }}>
          {digits.map(digit => (
            <text
              key={digit}
              x={DIGIT_X}
              y={y + digit * ROLL_STEP}
              textAnchor="middle"
              className="fill-map-preview-ink text-sm font-bold tabular-nums"
            >
              {digit}
            </text>
          ))}
        </g>
      </g>
      <text x={WORDS_X} y={y} className="fill-base-content text-map-caption font-semibold">
        {MAP_LABELS.moreNeeded}
      </text>
    </g>
  );
}
