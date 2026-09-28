import { edgeMidpoint, edgePath, hexagonPoints, monogramOf } from "./geometry";
import { nextFocusIndex } from "./useRovingFocus";
import { describe, expect, it } from "vitest";

describe("edgePath", () => {
  it("draws a straight line between two nodes one above the other", () => {
    expect(edgePath({ x: 300, y: 372 }, { x: 300, y: 560 })).toBe("M 300 372 L 300 560");
  });

  it("leaves and arrives horizontally between columns", () => {
    expect(edgePath({ x: 490, y: 170 }, { x: 740, y: 70 })).toBe("M 490 170 C 615 170, 615 70, 740 70");
  });

  it("puts the caption at the curve's midpoint", () => {
    expect(edgeMidpoint({ x: 490, y: 170 }, { x: 740, y: 70 })).toEqual({ x: 615, y: 120 });
  });
});

describe("monogramOf", () => {
  it("takes the first letter of a name", () => {
    expect(monogramOf("alice")).toBe("A");
    expect(monogramOf("Your wallet")).toBe("Y");
  });

  it("draws nothing for a name that is an id", () => {
    expect(monogramOf("0.0.4100")).toBe("");
  });
});

describe("hexagonPoints", () => {
  it("has six corners on the radius, flat at the top", () => {
    const corners = hexagonPoints(38).split(" ");
    expect(corners).toHaveLength(6);
    expect(corners[0]).toBe("38,0");
    expect(corners[3]).toBe("-38,0");
  });
});

describe("nextFocusIndex", () => {
  it("moves forward and back with the arrow keys, wrapping at the ends", () => {
    expect(nextFocusIndex(0, "ArrowRight", 3)).toBe(1);
    expect(nextFocusIndex(2, "ArrowDown", 3)).toBe(0);
    expect(nextFocusIndex(0, "ArrowLeft", 3)).toBe(2);
    expect(nextFocusIndex(1, "ArrowUp", 3)).toBe(0);
  });

  it("jumps to the ends with Home and End", () => {
    expect(nextFocusIndex(1, "Home", 3)).toBe(0);
    expect(nextFocusIndex(1, "End", 3)).toBe(2);
  });

  it("ignores every other key, and an empty map", () => {
    expect(nextFocusIndex(1, "Tab", 3)).toBeNull();
    expect(nextFocusIndex(0, "ArrowRight", 0)).toBeNull();
  });
});
