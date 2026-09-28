import { type EdgeRoute, routePath } from "./geometry";
import type { Comet as CometMotion } from "~~/services/liveMap/motion/frame";

/**
 * An operation travelling along an edge: one short dash of the edge's own path, moved from its start
 * to its end by a CSS animation (`animate-map-comet`), so it needs no sampling of the curve and costs
 * one stroke repaint a frame. It is not drawn at all under reduced motion; the edge's colour carries
 * the state instead.
 */
export function Comet({ route, comet }: { route: EdgeRoute; comet: CometMotion }) {
  return (
    <path
      d={routePath(route)}
      pathLength={100}
      fill="none"
      strokeWidth={4}
      strokeLinecap="round"
      // One dash of 8 in a path of 100, then a gap long enough that no second dash ever shows.
      strokeDasharray="8 200"
      aria-hidden="true"
      data-comet={comet.direction}
      className="pointer-events-none stroke-warning motion-safe:animate-map-comet motion-reduce:hidden"
      style={{
        animationDuration: `${comet.ms}ms`,
        animationDelay: `${comet.delayMs}ms`,
        animationDirection: comet.direction === "back" ? "reverse" : "normal",
      }}
    />
  );
}
