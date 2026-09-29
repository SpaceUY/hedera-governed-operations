"use client";

import { useEffect, useRef } from "react";
import { MAP_INSPECTOR } from "./copy";
import type { InspectorContent } from "./inspector";

type MapInspectorProps = {
  /** The DOM id the selected map item points at through `aria-controls`. */
  id: string;
  content: InspectorContent;
  onClose: () => void;
};

/**
 * The card that explains the selected node or edge: plain words first, the raw ids folded away. It
 * is a labelled region rather than a dialog: it sits beside the map without trapping focus, so the
 * arrow keys keep walking the map and Enter on another item replaces it, while Tab reaches its close
 * button and links. On a wide pane it floats over the map's lower left corner; on a narrow one it
 * sits under the map, full width, so it never hides the item it explains.
 */
export function MapInspector({ id, content, onClose }: MapInspectorProps) {
  const card = useRef<HTMLElement>(null);
  const { kicker, title, body, rows } = content;

  // Under the map on a phone the card can open below the fold; on a wide pane it is already in view.
  useEffect(() => {
    card.current?.scrollIntoView?.({ block: "nearest" });
  }, [title]);

  return (
    <section
      ref={card}
      id={id}
      aria-label={MAP_INSPECTOR.region}
      className="z-10 mt-3 flex flex-col gap-3 rounded-box border border-base-300 bg-base-100 px-5 py-4 shadow-xl sm:absolute sm:bottom-6 sm:left-6 sm:mt-0 sm:w-sm"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <p className="m-0 text-xs font-bold uppercase tracking-widest text-base-content/70">{kicker}</p>
          <h2 className="m-0 mt-0.5 text-base font-bold">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={MAP_INSPECTOR.close}
          className="btn btn-circle btn-outline ml-auto shrink-0 border-base-300"
        >
          <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p className="m-0 text-sm leading-relaxed">{body}</p>
      {rows.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer py-1 font-semibold text-base-content/70">{MAP_INSPECTOR.links}</summary>
          <dl className="m-0 mt-2 flex flex-col gap-1.5">
            {rows.map(({ term, value, href }) => (
              <div key={term} className="flex items-baseline gap-3">
                <dt className="w-16 shrink-0 text-base-content/70">{term}</dt>
                <dd className="m-0 min-w-0 break-all font-mono text-xs">
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="link link-primary">
                      {value}
                    </a>
                  ) : (
                    value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </section>
  );
}
