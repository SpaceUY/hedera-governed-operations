"use client";

import type { ReactNode } from "react";
import type { RovingFocus } from "./useRovingFocus";

export type MapItemRef = { kind: "node" | "edge"; id: string };

/**
 * What activating an item does, and which item is showing what it opened: the host's inspector,
 * the element `controls` names. The selected item reports it as expanded, like a disclosure button.
 */
export type MapActivation = {
  onActivate: (item: MapItemRef) => void;
  selected: MapItemRef | null;
  controls?: string;
};

type MapItemProps = {
  item: MapItemRef;
  /** The accessible name: the whole item in words, since its shape says nothing to a screen reader. */
  label: string;
  focus: RovingFocus;
  activation?: MapActivation;
  transform?: string;
  children: ReactNode;
};

/**
 * One focusable node or edge. Graph ids hold characters a DOM `id` or a CSS selector would need
 * escaped (`+/=:.->`), so an item is found by `data-node-id` / `data-edge-id` instead. It is a button
 * when something handles its activation, and a graphics symbol otherwise, so a screen reader never
 * announces a button that does nothing. The selected one is `aria-expanded`, which is also what
 * draws its highlight (`group-aria-expanded:`).
 */
export function MapItem({ item, label, focus, activation, transform, children }: MapItemProps) {
  const dataId = item.kind === "node" ? { "data-node-id": item.id } : { "data-edge-id": item.id };
  const onActivate = activation?.onActivate;
  const expanded = activation?.selected?.kind === item.kind && activation.selected.id === item.id;

  return (
    <g
      {...dataId}
      ref={focus.register(item.id)}
      transform={transform}
      role={onActivate ? "button" : "graphics-symbol"}
      aria-label={label}
      aria-expanded={onActivate ? expanded : undefined}
      aria-controls={expanded ? activation?.controls : undefined}
      tabIndex={focus.tabIndexOf(item.id)}
      // The pointer shows what a click opens: the whole item, its wide invisible hit line included.
      className={`group outline-none ${onActivate ? "cursor-pointer" : "cursor-default"}`}
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

/** The element drawn for one item under `root`, found by its data attribute since ids are not selectors. */
export function mapItemElement(root: ParentNode, item: MapItemRef): SVGGElement | undefined {
  const attribute = item.kind === "node" ? "data-node-id" : "data-edge-id";
  return [...root.querySelectorAll<SVGGElement>(`[${attribute}]`)].find(
    element => element.getAttribute(attribute) === item.id,
  );
}
