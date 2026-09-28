"use client";

import { type KeyboardEvent, useCallback, useId, useRef, useState } from "react";
import { type MapActivation, type MapItemRef, mapItemElement } from "./MapItem";

/**
 * Which node or edge the inspector shows. Click or Enter selects an item, selecting another replaces
 * it, and closing — the card's button, or Escape anywhere in the pane — gives focus back to the item,
 * so a keyboard user carries on from where they were. `paneRef` goes on the element that holds both
 * the map and the card, `onKeyDown` on the same element.
 */
export function useMapSelection() {
  const [selected, setSelected] = useState<MapItemRef | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const inspectorId = useId();

  const close = useCallback(() => {
    if (!selected) return;
    const item = paneRef.current && mapItemElement(paneRef.current, selected);
    setSelected(null);
    item?.focus();
  }, [selected]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !selected) return;
      event.preventDefault();
      close();
    },
    [selected, close],
  );

  const activation: MapActivation = { onActivate: setSelected, selected, controls: inspectorId };

  return { selected, activation, inspectorId, close, paneRef, onKeyDown };
}
