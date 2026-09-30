import { useSvgId } from "./useSvgId";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("useSvgId", () => {
  it("gives each caller its own id, prefixed and with nothing a url(#…) reference would need escaped", () => {
    const first = renderHook(() => useSvgId("map-draw")).result.current;
    const second = renderHook(() => useSvgId("map-draw")).result.current;
    expect(first).toMatch(/^map-draw-[\w-]+$/);
    expect(second).not.toBe(first);
  });
});
