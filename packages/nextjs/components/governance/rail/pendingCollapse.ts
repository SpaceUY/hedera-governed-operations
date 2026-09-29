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
  /** Whether rows past the fold are showing, so the list offers to fold them back. */
  canFold: boolean;
};

/** Every row, and the control to fold the list back once it runs past the fold. */
export function expandedList(total: number): CollapseState {
  return { visibleCount: total, hiddenCount: 0, canFold: total > COLLAPSED_VISIBLE_COUNT };
}

/**
 * The folded list: the first few rows, opened in full only when the selected row sits past the fold.
 * `selectedIndex` is the position of the selected proposal in the same order the list renders, or -1
 * when nothing selected is in this list at all.
 */
export function foldedList(total: number, selectedIndex: number): CollapseState {
  if (selectedIndex >= COLLAPSED_VISIBLE_COUNT) return expandedList(total);
  const visibleCount = Math.min(total, COLLAPSED_VISIBLE_COUNT);
  return { visibleCount, hiddenCount: total - visibleCount, canFold: false };
}

/** The section's summary count, e.g. for a heading that says how many are waiting without listing them. */
export function pendingSummaryLabel(count: number): string {
  return count === 1 ? "1 pending" : `${count} pending`;
}
