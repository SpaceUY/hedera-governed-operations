import { COLLAPSED_VISIBLE_COUNT, pendingSummaryLabel, resolveCollapse } from "./pendingCollapse";
import { describe, expect, it } from "vitest";

describe("resolveCollapse", () => {
  it("shows only the first few when collapsed and nothing selected further down", () => {
    expect(resolveCollapse(10, false, -1)).toEqual({ visibleCount: COLLAPSED_VISIBLE_COUNT, hiddenCount: 7 });
  });

  it("shows everything once expanded", () => {
    expect(resolveCollapse(10, true, -1)).toEqual({ visibleCount: 10, hiddenCount: 0 });
  });

  it("shows nothing hidden when the total already fits the collapsed count", () => {
    expect(resolveCollapse(2, false, -1)).toEqual({ visibleCount: 2, hiddenCount: 0 });
  });

  it("forces the list open when the selected row sits past the collapsed fold", () => {
    expect(resolveCollapse(10, false, 5)).toEqual({ visibleCount: 10, hiddenCount: 0 });
  });

  it("does not force it open for a selection inside the fold already", () => {
    expect(resolveCollapse(10, false, 1)).toEqual({ visibleCount: COLLAPSED_VISIBLE_COUNT, hiddenCount: 7 });
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
