import type { MapCaption } from "./caption";

/** The caption over the map: a bold lead, then what the lines mean. */
export function MapCaptionLine({ caption }: { caption: MapCaption }) {
  return (
    <p
      data-map-caption
      className="m-0 flex min-h-11 flex-wrap items-center gap-x-1.5 px-6 text-sm text-base-content/60"
    >
      <b className="font-semibold text-base-content">{caption.lead}</b>
      <span>{caption.text}</span>
    </p>
  );
}
