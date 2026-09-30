import { useId } from "react";

/** An id for an SVG `mask` or `clipPath`, unique on the page and safe inside a `url(#…)` reference. */
export function useSvgId(prefix: string): string {
  // useId returns characters a url(#...) reference would need escaped.
  return `${prefix}-${useId().replace(/[^\w-]/g, "")}`;
}
