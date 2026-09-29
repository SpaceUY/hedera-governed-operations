import { type EdgeRoute, routePath } from "./geometry";
import type { Comet as CometMotion } from "~~/services/liveMap/motion/frame";

/** Each part's dash (out of a path length of 100, then a gap no second dash reaches) and animation. */
const PARTS = {
  tail: {
    width: 8,
    dash: "30 300",
    className: {
      forward: "opacity-25 motion-safe:animate-map-comet-tail",
      back: "opacity-25 motion-safe:animate-map-comet-back",
    },
  },
  head: {
    width: 3.4,
    dash: "12 300",
    className: { forward: "motion-safe:animate-map-comet", back: "motion-safe:animate-map-comet-back" },
  },
} as const;

/**
 * An operation travelling along an edge: a short head with a faint, wider tail behind it, each a dash
 * of the edge's own path moved from one end to the other by a CSS animation of `stroke-dashoffset`,
 * so it needs no sampling of the curve. It is not drawn at all under reduced motion; the edge's colour
 * carries the state instead.
 */
export function Comet({ route, comet }: { route: EdgeRoute; comet: CometMotion }) {
  const d = routePath(route);
  return (
    <g aria-hidden="true" data-comet={comet.direction} className="pointer-events-none motion-reduce:hidden">
      {(["tail", "head"] as const).map(part => (
        <path
          key={part}
          d={d}
          pathLength={100}
          fill="none"
          strokeWidth={PARTS[part].width}
          strokeLinecap="round"
          strokeDasharray={PARTS[part].dash}
          data-comet-part={part}
          className={`stroke-warning ${PARTS[part].className[comet.direction]}`}
          style={{ animationDuration: `${comet.ms}ms`, animationDelay: `${comet.delayMs}ms` }}
        />
      ))}
    </g>
  );
}
