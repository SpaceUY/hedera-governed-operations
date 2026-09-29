import { COLLAPSED_VISIBLE_COUNT, expandedList, foldedList, pendingSummaryLabel } from "./pendingCollapse";
import { describe, expect, it } from "vitest";

describe("foldedList", () => {
  it("shows only the first few when nothing selected sits further down", () => {
    expect(foldedList(10, -1)).toEqual({ visibleCount: COLLAPSED_VISIBLE_COUNT, hiddenCount: 7, canFold: false });
  });

  it("shows nothing hidden when the total already fits the fold", () => {
    expect(foldedList(2, -1)).toEqual({ visibleCount: 2, hiddenCount: 0, canFold: false });
  });

  it("opens in full when the selected row sits past the fold, and offers to fold it back", () => {
    expect(foldedList(10, 5)).toEqual({ visibleCount: 10, hiddenCount: 0, canFold: true });
  });

  it("stays folded for a selection inside the fold already", () => {
    expect(foldedList(10, 1)).toEqual({ visibleCount: COLLAPSED_VISIBLE_COUNT, hiddenCount: 7, canFold: false });
  });
});

describe("expandedList", () => {
  it("shows every row and offers to fold them back", () => {
    expect(expandedList(10)).toEqual({ visibleCount: 10, hiddenCount: 0, canFold: true });
  });

  it("offers nothing to fold when everything fits anyway", () => {
    expect(expandedList(2)).toEqual({ visibleCount: 2, hiddenCount: 0, canFold: false });
  });
});

describe("pendingSummaryLabel", () => {
  it("singularises one", () => {
    expect(pendingSummaryLabel(1)).toBe("1 pending");
  });

  it("pluralises the rest", () => {
    expect(pendingSummaryLabel(0)).toBe("0 pending");
    expect(pendingSummaryLabel(4)).toBe("4 pending");
  });
});
