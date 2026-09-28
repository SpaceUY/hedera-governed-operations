/**
 * How the pending section collapses. The rail can carry dozens of open proposals, so it shows the
 * first few and a "show more" toggle rather than every row at once — but a row the URL or the search
 * control points at has to be visible without an extra click, so a selection past the fold forces the
 * list open regardless of the toggle's own state.
 */
export const COLLAPSED_VISIBLE_COUNT = 3;

export type CollapseState = {
  visibleCount: number;
  hiddenCount: number;
};

/**
 * `selectedIndex` is the position of the selected proposal in the same order the list renders, or -1
 * when nothing selected is in this list at all.
 */
export function resolveCollapse(total: number, expanded: boolean, selectedIndex: number): CollapseState {
  const forcedOpen = selectedIndex >= COLLAPSED_VISIBLE_COUNT;
  const visibleCount = expanded || forcedOpen ? total : Math.min(total, COLLAPSED_VISIBLE_COUNT);
  return { visibleCount, hiddenCount: total - visibleCount };
}

/** The section's summary count, e.g. for a heading that says how many are waiting without listing them. */
export function pendingSummaryLabel(count: number): string {
  return count === 1 ? "1 pending" : `${count} pending`;
}
