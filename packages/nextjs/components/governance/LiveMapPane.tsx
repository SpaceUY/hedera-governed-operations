"use client";

import { useCallback, useEffect, useMemo } from "react";
import { type TokenReading, TreasuryStrip } from "~~/components/governance/TreasuryStrip";
import { GovernanceMap } from "~~/components/governance/graph/GovernanceMap";
import { useMapDecorator } from "~~/components/governance/graph/MapDecoratorContext";
import { MapInspector } from "~~/components/governance/graph/MapInspector";
import { inspectorContentOf } from "~~/components/governance/graph/inspector";
import { composeMap } from "~~/components/governance/graph/mapModel";
import { nodeStateCaptions } from "~~/components/governance/graph/nodeStates";
import { remoteSignatureNotice } from "~~/components/governance/graph/remoteSignatureNotice";
import { useMapSelection } from "~~/components/governance/graph/useMapSelection";
import { useSelectedSchedule } from "~~/components/governance/rail/useSelectedSchedule";
import { GOVERNANCE_CONTRACTS, type GovernanceConfig, findDeployment } from "~~/config/governanceConfig";
import { useMapSnapshot } from "~~/hooks/mirror/useMapSnapshot";
import { useToken } from "~~/hooks/mirror/useToken";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { useProposalAnimationSync } from "~~/hooks/useProposalAnimationSync";
import { useRemoteApprovals } from "~~/hooks/useRemoteApprovals";
import { governanceEntitiesOf } from "~~/services/liveMap/model/graphEntities";
import { REST_FRAME, frameOf, nodeStatesShown, treasuryShown } from "~~/services/liveMap/motion/frame";
import type { ApprovedEvent } from "~~/services/liveMap/remoteApprovals";
import { SAUCERSWAP_V2_CONFIG } from "~~/services/swap/saucerSwapConfig";

export type LiveMapPaneProps = {
  /** Resolved once by the governance layout's setup guard. */
  config: GovernanceConfig;
  /** Told what to say when a read reports a signature this session did not send; the host shows it. */
  onRemoteSignature?: (notice: string) => void;
};

function tokenReadingOf(query: ReturnType<typeof useToken>): TokenReading {
  if (query.data) return query.data;
  return query.isError ? "unreadable" : null;
}

/**
 * The map pane: the treasury figures and the governance map, both drawn from one world, laid out by
 * the host's `MapDecoratorProvider` (without one every node is placed by role). `useMapSnapshot` composes the queries the rail polls too; the pane itself only reads the
 * governed token and USDC for the strip's symbols and supply (`useToken`, the same query the
 * snapshot reads the token's pause state from, so one request serves both). It plays what changed
 * between two reads (`useProposalAnimationSync`), so while a sequence plays the map and the figures
 * show the world it started from, and catch up when it lands. The seat the connected account holds
 * is named "You", and a signature this session did not send is announced through
 * `onRemoteSignature` (the layout's rail banner) as well as played. A click or Enter on a node or
 * edge opens the inspector over the map's lower left corner (`useMapSelection`), which explains it
 * from the same map; selecting a proposal on the rail closes it.
 */
export function LiveMapPane({ config, onRemoteSignature }: LiveMapPaneProps) {
  const decorate = useMapDecorator();
  const { targetNetwork } = useTargetNetwork();
  const { accountId: viewerAccountId } = useHederaSigner();
  const { governanceAccountId, network, executor, vault, demoTokenId } = config;
  const usdcTokenId = SAUCERSWAP_V2_CONFIG[network].usdcToken;
  const { snapshot, previous, events, readAt, error } = useMapSnapshot({
    governanceAccountId,
    executorContractId: executor.hederaContractId,
    network,
    vaultContractId: vault.hederaContractId,
    demoTokenId,
    usdcTokenId,
  });
  const governedToken = useToken(demoTokenId, { network });
  const usdc = useToken(usdcTokenId, { network });
  const { world, playing } = useProposalAnimationSync({ snapshot, previous, events, readAt });
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
  const treasury = treasuryShown(playing, world);
  const nodeStates = nodeStatesShown(playing, world);
  const vaultReleases = useMemo(
    () => ({
      first: findDeployment(targetNetwork.id, GOVERNANCE_CONTRACTS.vaultFirstImplementation)?.address,
      next: findDeployment(targetNetwork.id, GOVERNANCE_CONTRACTS.vaultNextImplementation)?.address,
    }),
    [targetNetwork.id],
  );
  // The vault's and the token's state lines change with the figures: when a run lands, not before.
  const shownMap = useMemo(
    () => map && { ...map, captions: { ...map.captions, ...nodeStateCaptions(nodeStates, vaultReleases) } },
    [map, nodeStates, vaultReleases],
  );
  const announce = useCallback(
    (approval: ApprovedEvent) => onRemoteSignature?.(remoteSignatureNotice(approval, { map, world: snapshot })),
    [map, snapshot, onRemoteSignature],
  );
  useRemoteApprovals({ events, world: snapshot, network, onRemote: announce });

  const { selected, activation, inspectorId, close, dismiss, paneRef, onKeyDown } = useMapSelection();
  // Selecting a proposal on the rail moves the reader's attention there, so the card over the map goes.
  const { selectedScheduleId } = useSelectedSchedule();
  useEffect(() => {
    dismiss();
  }, [selectedScheduleId, dismiss]);
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
      <TreasuryStrip
        treasury={treasury}
        council={world?.council ?? null}
        governedToken={tokenReadingOf(governedToken)}
        usdc={tokenReadingOf(usdc)}
      />
      {/* Escape anywhere in the pane closes the inspector; the handler only listens, the map's items
          and the card's controls are what take focus. */}
      <div ref={paneRef} onKeyDown={onKeyDown} className="relative flex min-h-64 flex-1 flex-col p-6 lg:min-h-0">
        <div className="min-h-0 flex-1">
          <GovernanceMap
            map={shownMap}
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
