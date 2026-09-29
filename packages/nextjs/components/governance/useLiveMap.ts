"use client";

import { useCallback, useEffect, useMemo } from "react";
import type { TokenReading } from "~~/components/governance/TreasuryStrip";
import { inspectorContentOf } from "~~/components/governance/graph/inspector";
import { nodeStateCaptions } from "~~/components/governance/graph/nodeStates";
import { remoteSignatureNotice } from "~~/components/governance/graph/remoteSignatureNotice";
import { useComposedMap } from "~~/components/governance/graph/useComposedMap";
import { useMapSelection } from "~~/components/governance/graph/useMapSelection";
import { useSelectedSchedule } from "~~/components/governance/rail/useSelectedSchedule";
import { GOVERNANCE_CONTRACTS, type GovernanceConfig, findDeployment } from "~~/config/governanceConfig";
import { useMapSnapshot } from "~~/hooks/mirror/useMapSnapshot";
import { useToken } from "~~/hooks/mirror/useToken";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { useProposalAnimationSync } from "~~/hooks/useProposalAnimationSync";
import { useRemoteApprovals } from "~~/hooks/useRemoteApprovals";
import { REST_FRAME, frameOf, nodeStatesShown, treasuryShown } from "~~/services/liveMap/motion/frame";
import type { ApprovedEvent } from "~~/services/liveMap/remoteApprovals";
import { SAUCERSWAP_V2_CONFIG } from "~~/services/swap/saucerSwapConfig";

export type LiveMapOptions = {
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
 * Everything the map pane draws, from one world. `useMapSnapshot` composes the queries the rail polls
 * too; this only adds the governed token and USDC for the strip's symbols and decimals (`useToken`, the
 * same query the snapshot reads the token's pause state from, so one request serves both). It plays
 * what changed between two reads (`useProposalAnimationSync`), so while a sequence plays the map and
 * the figures show the world it started from, and catch up when it lands. A signature this session did
 * not send is announced through `onRemoteSignature` as well as played. The selection (`useMapSelection`)
 * opens the inspector, explained from the same map; selecting a proposal on the rail closes it.
 */
export function useLiveMap({ config, onRemoteSignature }: LiveMapOptions) {
  const { targetNetwork } = useTargetNetwork();
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

  const map = useComposedMap(config, world);
  const frame = useMemo(
    () => (map && world ? frameOf(playing, { graph: map.graph, shown: world }) : REST_FRAME),
    [map, world, playing],
  );
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

  return {
    treasury: treasuryShown(playing, world),
    council: world?.council ?? null,
    tokens: { governedToken: tokenReadingOf(governedToken), usdc: tokenReadingOf(usdc) },
    map: shownMap,
    frame,
    error,
    inspector,
    selection: { activation, inspectorId, close, paneRef, onKeyDown },
  };
}
