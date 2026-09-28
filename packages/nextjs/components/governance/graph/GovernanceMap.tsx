"use client";

import { GovernanceGraph } from "./GovernanceGraph";
import { MAP_LABELS } from "./copy";
import type { ComposedMap } from "./mapModel";
import type { CouncilKey } from "@sh/core/governance/council";
import type { MapFrame } from "~~/services/liveMap/motion/frame";

export type GovernanceMapProps = {
  /** The composed map of the world being shown (`composeMap`), or null until the council is read. */
  map: ComposedMap | null;
  council: CouncilKey | null;
  frame: MapFrame;
  /** The council's read error: without the council there is nothing to draw. */
  error: unknown;
};

/** The governance map, or what it says while it cannot be drawn. */
export function GovernanceMap({ map, council, frame, error }: GovernanceMapProps) {
  if (error) {
    return (
      <p role="alert" className="alert alert-warning m-4">
        {MAP_LABELS.unavailable}
      </p>
    );
  }
  if (!map || !council) {
    return (
      <p className="flex h-full items-center justify-center gap-2 text-sm text-base-content/70">
        <span className="loading loading-spinner loading-sm" aria-hidden="true" />
        {MAP_LABELS.loading}
      </p>
    );
  }
  return <GovernanceGraph {...map} council={council} frame={frame} />;
}
