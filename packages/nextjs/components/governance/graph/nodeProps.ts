import type { MapItemRef } from "./MapItem";
import type { RovingFocus } from "./useRovingFocus";
import type { Point } from "~~/services/governance/graph";
import type { NodeTone } from "~~/services/liveMap/motion/frame";

/** What every node component takes: where it is, what it is called, and how it joins keyboard focus. */
export type NodeProps = {
  id: string;
  label: string;
  caption: string;
  position: Point;
  focus: RovingFocus;
  onActivate?: (item: MapItemRef) => void;
  /** Set while an operation is reaching the node: its plate flashes in the tone's colour. */
  highlight?: NodeTone;
};

export const translate = ({ x, y }: Point): string => `translate(${x} ${y})`;

/** The ring keyboard focus draws around a node, invisible until then. */
export const FOCUS_RING_CLASS = "fill-none stroke-primary opacity-0 group-focus-visible:opacity-100";

const TONE_STROKE: Record<NodeTone, string> = {
  progress: "stroke-warning",
  success: "stroke-success",
  error: "stroke-error",
};

/**
 * The stroke of a node's plate: grey at rest, or the colour of the operation reaching it, with a
 * flash that the stylesheet leaves out under reduced motion.
 */
export function plateStrokeClass(highlight: NodeTone | undefined): string {
  const stroke = highlight ? `${TONE_STROKE[highlight]} motion-safe:animate-map-plate-flash` : "stroke-base-content/40";
  return `fill-base-100 ${stroke}`;
}
