import type { MapItemRef } from "./MapItem";
import type { RovingFocus } from "./useRovingFocus";
import type { Point } from "~~/services/governance/graph";

/** What every node component takes: where it is, what it is called, and how it joins keyboard focus. */
export type NodeProps = {
  id: string;
  label: string;
  caption: string;
  position: Point;
  focus: RovingFocus;
  onActivate?: (item: MapItemRef) => void;
};

export const translate = ({ x, y }: Point): string => `translate(${x} ${y})`;

/** The ring keyboard focus draws around a node, invisible until then. */
export const FOCUS_RING_CLASS = "fill-none stroke-primary opacity-0 group-focus-visible:opacity-100";
