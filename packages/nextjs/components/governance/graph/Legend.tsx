import { hexagonPoints } from "./geometry";
import { MAP_LEGEND } from "~~/services/governance/proposalLabels";

type Swatch = (typeof MAP_LEGEND.lines)[number]["swatch"];

/** The line each legend entry stands for, drawn with the same strokes the edges use. */
function LineSwatch({ swatch }: { swatch: Swatch }) {
  const line = (className: string, x1: number, x2: number) => (
    <line x1={x1} y1={5} x2={x2} y2={5} strokeWidth={1.8} strokeLinecap="round" className={className} />
  );
  return (
    <svg width={28} height={10} aria-hidden="true" className="shrink-0">
      {swatch === "authority" && line("stroke-base-content/50", 1, 27)}
      {swatch === "preview" && line("stroke-map-preview [stroke-dasharray:6_5]", 1, 27)}
      {swatch === "funds" && line("stroke-base-content/50 [stroke-dasharray:1_5]", 1, 27)}
      {swatch === "activity" && (
        <>
          {line("stroke-warning", 1, 12)}
          {line("stroke-success", 16, 27)}
        </>
      )}
    </svg>
  );
}

/**
 * Always on the canvas, so the map explains itself: what each line means and what each shape is.
 * Plain HTML beside the SVG, so its text wraps and reads like any other text on the page.
 */
export function Legend() {
  return (
    <aside
      aria-label={MAP_LEGEND.heading}
      className="m-3 mt-0 self-end rounded-box border border-base-300 bg-base-100/90 px-4 py-3 text-xs shadow-sm"
    >
      <ul className="space-y-1">
        {MAP_LEGEND.lines.map(({ swatch, term, meaning }) => (
          <li key={swatch} className="flex items-center gap-3">
            <LineSwatch swatch={swatch} />
            <span>
              <strong className="font-semibold">{term}</strong> <span className="text-base-content/70">{meaning}</span>
            </span>
          </li>
        ))}
      </ul>
      <ul className="mt-2 flex gap-4 border-t border-base-300 pt-2 text-base-content/70">
        <li className="flex items-center gap-1">
          <svg width={12} height={12} aria-hidden="true">
            <circle cx={6} cy={6} r={5} fill="none" strokeWidth={1.2} className="stroke-base-content/70" />
          </svg>
          {MAP_LEGEND.shapes.account}
        </li>
        <li className="flex items-center gap-1">
          <svg width={14} height={12} aria-hidden="true">
            <rect
              x={1}
              y={2}
              width={12}
              height={8}
              rx={2.5}
              fill="none"
              strokeWidth={1.2}
              className="stroke-base-content/70"
            />
          </svg>
          {MAP_LEGEND.shapes.contract}
        </li>
        <li className="flex items-center gap-1">
          <svg width={12} height={12} viewBox="-6 -6 12 12" aria-hidden="true">
            <polygon points={hexagonPoints(5)} fill="none" strokeWidth={1.2} className="stroke-base-content/70" />
          </svg>
          {MAP_LEGEND.shapes.token}
        </li>
      </ul>
    </aside>
  );
}
