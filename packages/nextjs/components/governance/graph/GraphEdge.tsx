"use client";

import { useId } from "react";
import { type MapActivation, MapItem } from "./MapItem";
import { type EdgeRoute, routePath } from "./geometry";
import type { RovingFocus } from "./useRovingFocus";
import type { EdgeKind, EdgePhase } from "~~/services/liveMap/model/graph";

const PHASE_STROKE: Record<EdgePhase, string> = {
  rest: "stroke-base-content/35",
  preview: "stroke-map-preview",
  progress: "stroke-warning",
  complete: "stroke-success",
  failed: "stroke-error",
  void: "stroke-base-content/60",
};

/**
 * A preview, and the path a settled proposal never took, are dashed whatever the edge is; otherwise
 * money moves along a dotted line and authority along a solid one, in the phase's colour.
 */
function dashOf(kind: EdgeKind, phase: EdgePhase): string {
  if (phase === "preview" || phase === "void") return "[stroke-dasharray:6_5]";
  if (kind === "funds") return "[stroke-dasharray:1_5]";
  return "";
}

/** Wide enough to cover the line under the pointer (2.6) with the round caps. */
const DRAW_MASK_WIDTH = 8;

type GraphEdgeProps = {
  id: string;
  kind: EdgeKind;
  phase: EdgePhase;
  /** Where it runs (`routeOnMap`). */
  route: EdgeRoute;
  /** The accessible name: kind, both ends and meaning. */
  label: string;
  focus: RovingFocus;
  activation?: MapActivation;
  /** Changes when a new preview starts: the dashed line draws itself again. */
  drawKey?: string | null;
};

/**
 * One edge in any phase. The phase is set by whoever draws the map — a preview, an animation — and
 * the edge only renders it; at rest it is grey, and the coloured phases are meant to pass. It carries
 * no words on the map: what it means is its accessible name, and the inspector's once it is selected.
 */
export function GraphEdge({ id, kind, phase, route, label, focus, activation, drawKey = null }: GraphEdgeProps) {
  const path = routePath(route);
  // useId returns characters a url(#...) reference would need escaped.
  const maskId = `map-draw-${useId().replace(/[^\w-]/g, "")}`;
  const drawing = phase === "preview";

  return (
    <MapItem item={{ kind: "edge", id }} label={label} focus={focus} activation={activation}>
      <path d={path} fill="none" strokeWidth={14} className="stroke-transparent" />
      <path
        d={path}
        fill="none"
        strokeWidth={6}
        className="stroke-primary/40 opacity-0 group-focus-visible:opacity-100 group-aria-expanded:opacity-100"
      />
      {drawing && (
        // User-space units: a horizontal edge has a bounding box of zero height, which would hide it.
        <mask id={maskId} maskUnits="userSpaceOnUse">
          {/* White is the mask's luminance, not a colour anyone sees. */}
          <path
            key={drawKey ?? "preview"}
            d={path}
            fill="none"
            pathLength={100}
            strokeWidth={DRAW_MASK_WIDTH}
            strokeLinecap="round"
            className="map-draw stroke-white motion-safe:animate-map-draw"
          />
        </mask>
      )}
      <path
        d={path}
        fill="none"
        strokeLinecap="round"
        data-phase={phase}
        mask={drawing ? `url(#${maskId})` : undefined}
        // `map-edge-line` (globals.css): 1.6 wide, 2.6 under the pointer, keyboard focus or selection,
        // and a quick colour change into a phase but a slow relax back to rest.
        className={`map-edge-line ${PHASE_STROKE[phase]} ${dashOf(kind, phase)}`}
      />
    </MapItem>
  );
}
