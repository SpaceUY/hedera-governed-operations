import type { MapActivation } from "./MapItem";
import type { RovingFocus } from "./useRovingFocus";
import type { Point } from "~~/services/liveMap/model/graph";
import type { NodeTone } from "~~/services/liveMap/motion/frame";

/** What every node component takes: where it is, what it is called, and how it joins keyboard focus. */
export type NodeProps = {
  id: string;
  label: string;
  caption: string;
  position: Point;
  focus: RovingFocus;
  activation?: MapActivation;
  /** Set while an operation is reaching the node: its plate flashes in the tone's colour. */
  highlight?: NodeTone;
  /** What the previewed operation would do to this node ("would become v2"); crossfades over the caption. */
  preview?: string;
  /** Changes when a new preview starts, so its words fade in again. */
  drawKey?: string | null;
};

/** A node's accessible name: its name, its caption, and what a preview says would happen to it. */
export function nodeAccessibleName({
  label,
  caption,
  preview,
}: Pick<NodeProps, "label" | "caption" | "preview">): string {
  return preview ? `${label}, ${caption}, ${preview}` : `${label}, ${caption}`;
}

export const translate = ({ x, y }: Point): string => `translate(${x} ${y})`;

/** The ring keyboard focus draws around a node, invisible until then. */
export const FOCUS_RING_CLASS = "fill-none stroke-primary opacity-0 group-focus-visible:opacity-100";

/** The stroke of each tone an operation gives a node or the treasury's ring. */
export const TONE_STROKE: Record<NodeTone, string> = {
  progress: "stroke-warning",
  success: "stroke-success",
  error: "stroke-error",
};

/**
 * The stroke of a node's plate: grey at rest, brighter under the pointer or keyboard focus and primary
 * and thicker while the inspector shows it, or the colour of the operation reaching it, with a flash
 * the stylesheet leaves out under reduced motion.
 */
export function plateStrokeClass(highlight: NodeTone | undefined): string {
  const stroke = highlight
    ? `${TONE_STROKE[highlight]} motion-safe:animate-map-plate-flash`
    : "stroke-base-content/40 group-hover:stroke-base-content/80 group-focus-visible:stroke-base-content/80 group-aria-expanded:stroke-primary group-aria-expanded:stroke-2";
  return `map-plate fill-base-100 transition-colors duration-180 motion-reduce:transition-none ${stroke}`;
}
