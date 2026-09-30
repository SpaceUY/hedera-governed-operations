"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** Where there is no `matchMedia` — the server, some test environments — motion is not reduced. */
const mediaQuery = (): MediaQueryList | null =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;

function subscribe(onChange: () => void): () => void {
  const query = mediaQuery();
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

const isReduced = (): boolean => mediaQuery()?.matches ?? false;
const onServer = (): boolean => false;

/**
 * Whether the person asked the system for less motion, followed live: turning the setting on while
 * the page is open takes effect at once. For motion driven from script; CSS reads the same media
 * query itself (`motion-safe:` / `motion-reduce:`).
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, isReduced, onServer);
}
