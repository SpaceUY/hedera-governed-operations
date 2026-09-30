// @vitest-environment jsdom
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** A `matchMedia` whose answer the test can change, notifying listeners like a browser does. */
function stubMatchMedia(initially: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: initially,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => query),
  );
  return {
    listeners,
    set(matches: boolean) {
      query.matches = matches;
      listeners.forEach(listener => listener());
    },
  };
}

afterEach(() => void vi.unstubAllGlobals());

describe("usePrefersReducedMotion", () => {
  it("follows the system setting while the page is open", () => {
    const media = stubMatchMedia(false);
    const { result, unmount } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);

    act(() => media.set(true));
    expect(result.current).toBe(true);
    act(() => media.set(false));
    expect(result.current).toBe(false);

    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it("assumes full motion where there is no matchMedia", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false);
  });
});
