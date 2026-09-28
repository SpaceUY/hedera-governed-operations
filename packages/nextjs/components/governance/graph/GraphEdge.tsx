"use client";

import { MapItem, type MapItemRef } from "./MapItem";
import { type EdgeRoute, routePath } from "./geometry";
import type { RovingFocus } from "./useRovingFocus";
import type { EdgeKind, EdgePhase } from "~~/services/governance/graph";

const PHASE_STROKE: Record<EdgePhase, string> = {
  rest: "stroke-base-content/35",
  preview: "stroke-map-preview",
  progress: "stroke-warning",
  complete: "stroke-success",
  failed: "stroke-error",
};

/**
 * A preview is dashed whatever the edge is; otherwise money moves along a dotted line and authority
 * along a solid one, in the phase's colour.
 */
function dashOf(kind: EdgeKind, phase: EdgePhase): string {
  if (phase === "preview") return "[stroke-dasharray:6_5]";
  if (kind === "funds") return "[stroke-dasharray:1_5]";
  return "";
}

type GraphEdgeProps = {
  id: string;
  kind: EdgeKind;
  phase: EdgePhase;
  /** Where it runs (`routeOnMap`). */
  route: EdgeRoute;
  /** The accessible name: kind, both ends and meaning. */
  label: string;
  /** The meaning alone, shown at the midpoint on hover and focus. */
  caption: string;
  focus: RovingFocus;
  onActivate?: (item: MapItemRef) => void;
};

/**
 * One edge in any phase. The phase is set by whoever draws the map — a preview, an animation — and
 * the edge only renders it; at rest it is grey, and the coloured phases are meant to pass.
 */
export function GraphEdge({ id, kind, phase, route, label, caption, focus, onActivate }: GraphEdgeProps) {
  const path = routePath(route);
  const { middle } = route;

  return (
    <MapItem item={{ kind: "edge", id }} label={label} focus={focus} onActivate={onActivate}>
      <path d={path} fill="none" strokeWidth={14} className="stroke-transparent" />
      <path
        d={path}
        fill="none"
        strokeWidth={6}
        className="stroke-primary/40 opacity-0 group-focus-visible:opacity-100"
      />
      <path
        d={path}
        fill="none"
        strokeWidth={1.6}
        strokeLinecap="round"
        data-phase={phase}
        className={`${PHASE_STROKE[phase]} ${dashOf(kind, phase)}`}
      />
      <text
        x={middle.x}
        y={middle.y - 6}
        textAnchor="middle"
        className="fill-base-content stroke-base-200 text-map-caption opacity-0 [paint-order:stroke] group-hover:opacity-100 group-focus-visible:opacity-100"
        strokeWidth={4}
      >
        {caption}
      </text>
    </MapItem>
  );
}
