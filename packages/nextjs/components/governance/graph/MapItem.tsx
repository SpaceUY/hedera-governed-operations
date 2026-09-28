"use client";

import type { ReactNode } from "react";
import type { RovingFocus } from "./useRovingFocus";

export type MapItemRef = { kind: "node" | "edge"; id: string };

type MapItemProps = {
  item: MapItemRef;
  /** The accessible name: the whole item in words, since its shape says nothing to a screen reader. */
  label: string;
  focus: RovingFocus;
  onActivate?: (item: MapItemRef) => void;
  transform?: string;
  children: ReactNode;
};

/**
 * One focusable node or edge. Graph ids hold characters a DOM `id` or a CSS selector would need
 * escaped (`+/=:.->`), so an item is found by `data-node-id` / `data-edge-id` instead. It is a button
 * when something handles its activation, and a graphics symbol otherwise, so a screen reader never
 * announces a button that does nothing.
 */
export function MapItem({ item, label, focus, onActivate, transform, children }: MapItemProps) {
  const dataId = item.kind === "node" ? { "data-node-id": item.id } : { "data-edge-id": item.id };

  return (
    <g
      {...dataId}
      ref={focus.register(item.id)}
      transform={transform}
      role={onActivate ? "button" : "graphics-symbol"}
      aria-label={label}
      tabIndex={focus.tabIndexOf(item.id)}
      className="group cursor-default outline-none"
      onFocus={() => focus.onFocus(item.id)}
      onClick={onActivate ? () => onActivate(item) : undefined}
      onKeyDown={event => {
        if (onActivate && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onActivate(item);
          return;
        }
        focus.onKeyDown(event, item.id);
      }}
    >
      {children}
    </g>
  );
}
