"use client";

import { TreasuryStrip } from "~~/components/governance/TreasuryStrip";
import { GovernanceMap } from "~~/components/governance/graph/GovernanceMap";
import { MapInspector } from "~~/components/governance/graph/MapInspector";
import { type LiveMapOptions, useLiveMap } from "~~/components/governance/useLiveMap";

export type LiveMapPaneProps = LiveMapOptions;

/**
 * The map pane: the treasury figures and the governance map, both drawn from one world (`useLiveMap`),
 * laid out by the host's `MapDecoratorProvider` (without one every node is placed by role). The seat
 * the connected account holds is named "You". A click or Enter on a node or edge opens the inspector
 * over the map's lower left corner, which explains it from the same map.
 */
export function LiveMapPane(options: LiveMapPaneProps) {
  const { treasury, council, tokens, map, frame, error, inspector, selection } = useLiveMap(options);
  const { activation, inspectorId, close, paneRef, onKeyDown } = selection;

  return (
    <>
      <TreasuryStrip treasury={treasury} council={council} governedToken={tokens.governedToken} usdc={tokens.usdc} />
      {/* Escape anywhere in the pane closes the inspector; the handler only listens, the map's items
          and the card's controls are what take focus. */}
      <div ref={paneRef} onKeyDown={onKeyDown} className="relative flex min-h-64 flex-1 flex-col p-6 lg:min-h-0">
        <div className="min-h-0 flex-1">
          <GovernanceMap map={map} council={council} frame={frame} error={error} activation={activation} />
        </div>
        {inspector && <MapInspector id={inspectorId} content={inspector} onClose={close} />}
      </div>
    </>
  );
}
