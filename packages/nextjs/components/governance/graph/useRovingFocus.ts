"use client";

import { type KeyboardEvent, useCallback, useRef, useState } from "react";

const STEPS: Partial<Record<string, "next" | "previous" | "first" | "last">> = {
  ArrowRight: "next",
  ArrowDown: "next",
  ArrowLeft: "previous",
  ArrowUp: "previous",
  Home: "first",
  End: "last",
};

/** Where a key moves focus in a list of `length` items, wrapping at the ends; null for any other key. */
export function nextFocusIndex(index: number, key: string, length: number): number | null {
  const step = STEPS[key];
  if (!step || length === 0) return null;
  if (step === "first") return 0;
  if (step === "last") return length - 1;
  return (index + (step === "next" ? 1 : -1) + length) % length;
}

/**
 * A roving tabindex over the map's nodes and edges: the map is one Tab stop, the arrow keys move
 * between its items, and the item last focused is the one Tab returns to. Thirty-odd items each in
 * the Tab order would make the rail beside the map a long way off for a keyboard user.
 */
export function useRovingFocus(ids: readonly string[]) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const elements = useRef(new Map<string, SVGGElement>());
  const current = activeId !== null && ids.includes(activeId) ? activeId : ids[0];

  const register = useCallback(
    (id: string) => (element: SVGGElement | null) => {
      if (element) elements.current.set(id, element);
      else elements.current.delete(id);
    },
    [],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent, id: string) => {
      const next = nextFocusIndex(ids.indexOf(id), event.key, ids.length);
      if (next === null) return;
      event.preventDefault();
      setActiveId(ids[next]);
      elements.current.get(ids[next])?.focus();
    },
    [ids],
  );

  return {
    tabIndexOf: (id: string) => (id === current ? 0 : -1),
    register,
    onKeyDown,
    onFocus: setActiveId,
  };
}

export type RovingFocus = ReturnType<typeof useRovingFocus>;
