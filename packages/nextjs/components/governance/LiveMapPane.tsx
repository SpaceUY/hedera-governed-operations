"use client";

import { useCallback, useMemo } from "react";
import { TreasuryStrip } from "~~/components/governance/TreasuryStrip";
import { GovernanceMap } from "~~/components/governance/graph/GovernanceMap";
import { MapInspector } from "~~/components/governance/graph/MapInspector";
import { inspectorContentOf } from "~~/components/governance/graph/inspector";
import { type MapDecorator, composeMap } from "~~/components/governance/graph/mapModel";
import { remoteSignatureNotice } from "~~/components/governance/graph/remoteSignatureNotice";
import { useMapSelection } from "~~/components/governance/graph/useMapSelection";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { useMapSnapshot } from "~~/hooks/mirror/useMapSnapshot";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { useProposalAnimationSync } from "~~/hooks/useProposalAnimationSync";
import { useRemoteApprovals } from "~~/hooks/useRemoteApprovals";
import { LIVE_MAP_STATUS_NOTE } from "~~/services/governance/proposalLabels";
import { governanceEntitiesOf } from "~~/services/liveMap/model/graphEntities";
import { REST_FRAME, frameOf, treasuryShown } from "~~/services/liveMap/motion/frame";
import type { ApprovedEvent } from "~~/services/liveMap/remoteApprovals";
import { SAUCERSWAP_V2_CONFIG } from "~~/services/swap/saucerSwapConfig";

export type LiveMapPaneProps = {
  /** Resolved once by the governance layout's setup guard. */
  config: GovernanceConfig;
  /** A hand-composed layout; without one the map places every node by role (`autoLayout`). */
  decorate?: MapDecorator;
  /** Told what to say when a read reports a signature this session did not send; the host shows it. */
  onRemoteSignature?: (notice: string) => void;
};

/**
 * The map pane: the treasury figures, the status line and the governance map, all drawn from one
 * world. It reads nothing of its own — `useMapSnapshot` composes the queries the rail polls too —
 * and plays what changed between two reads (`useProposalAnimationSync`), so while a sequence plays
 * the map and the figures show the world it started from, and catch up when it lands. The seat the
 * connected account holds is named "You", and a signature this session did not send is announced
 * through `onRemoteSignature` (the layout's rail banner) as well as played. A click or Enter on a node or edge opens the inspector over the map's
 * lower left corner (`useMapSelection`), which explains it from the same map.
 */
export function LiveMapPane({ config, decorate, onRemoteSignature }: LiveMapPaneProps) {
  const { targetNetwork } = useTargetNetwork();
  const { accountId: viewerAccountId } = useHederaSigner();
  const { governanceAccountId, network, executor, vault, demoTokenId } = config;
  const { snapshot, previous, events, error } = useMapSnapshot({
    governanceAccountId,
    executorContractId: executor.hederaContractId,
    network,
    vaultContractId: vault.hederaContractId,
    demoTokenId,
    usdcTokenId: SAUCERSWAP_V2_CONFIG[network].usdcToken,
  });
  const { world, playing } = useProposalAnimationSync({ snapshot, previous, events });
  const entities = useMemo(() => governanceEntitiesOf(config, targetNetwork.id), [config, targetNetwork.id]);

  const map = useMemo(
    () =>
      world &&
      composeMap(
        {
          governanceAccountId,
          executor: { ref: executor.hederaContractId, evmAddress: executor.address },
          council: world.council,
          proposers: world.proposers,
          entities,
          proposals: world.proposals,
        },
        decorate,
        viewerAccountId,
      ),
    [world, entities, governanceAccountId, executor, decorate, viewerAccountId],
  );
  const frame = useMemo(
    () => (map && world ? frameOf(playing, { graph: map.graph, shown: world }) : REST_FRAME),
    [map, world, playing],
  );
  const treasury = treasuryShown(playing, { shown: world, latest: snapshot });
  const announce = useCallback(
    (approval: ApprovedEvent) => onRemoteSignature?.(remoteSignatureNotice(approval, { map, world: snapshot })),
    [map, snapshot, onRemoteSignature],
  );
  useRemoteApprovals({ events, world: snapshot, network, onRemote: announce });

  const { selected, activation, inspectorId, close, paneRef, onKeyDown } = useMapSelection();
  const inspector =
    selected && map && world
      ? inspectorContentOf(selected, {
          graph: map.graph,
          ghosts: map.ghosts,
          council: world.council,
          proposers: world.proposers,
          copy: map.inspector,
          explorerUrl: targetNetwork.blockExplorers?.default.url,
        })
      : null;

  return (
    <>
      <TreasuryStrip treasury={treasury} council={world?.council ?? null} />
      <p className="m-0 px-6 py-3 text-sm text-base-content/70">{LIVE_MAP_STATUS_NOTE}</p>
      {/* Escape anywhere in the pane closes the inspector; the handler only listens, the map's items
          and the card's controls are what take focus. */}
      <div ref={paneRef} onKeyDown={onKeyDown} className="relative flex min-h-64 flex-1 flex-col p-6 pt-0 lg:min-h-0">
        <div className="min-h-0 flex-1">
          <GovernanceMap
            map={map}
            council={world?.council ?? null}
            frame={frame}
            error={error}
            activation={activation}
          />
        </div>
        {inspector && <MapInspector id={inspectorId} content={inspector} onClose={close} />}
      </div>
    </>
  );
}
