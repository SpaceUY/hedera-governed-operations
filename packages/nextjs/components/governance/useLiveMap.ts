"use client";

import { useCallback, useEffect, useMemo } from "react";
import type { TokenReading } from "~~/components/governance/TreasuryStrip";
import { mapCaptionOf } from "~~/components/governance/graph/caption";
import { inspectorContentOf } from "~~/components/governance/graph/inspector";
import { nodeStateCaptions, releaseOf } from "~~/components/governance/graph/nodeStates";
import { remoteSignatureNotice } from "~~/components/governance/graph/remoteSignatureNotice";
import { useComposedMap } from "~~/components/governance/graph/useComposedMap";
import { captionFactsOf, useMapPreview } from "~~/components/governance/graph/useMapPreview";
import { useMapSelection } from "~~/components/governance/graph/useMapSelection";
import { GOVERNANCE_CONTRACTS, type GovernanceConfig, findDeployment } from "~~/config/governanceConfig";
import { useMapSnapshot } from "~~/hooks/mirror/useMapSnapshot";
import { type TokenQueryData, useToken } from "~~/hooks/mirror/useToken";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { useProposalAnimationSync } from "~~/hooks/useProposalAnimationSync";
import { useRemoteApprovals } from "~~/hooks/useRemoteApprovals";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";
import { REST_FRAME, nodeStatesShown, treasuryShown } from "~~/services/liveMap/motion/frame";
import type { PreviewContext } from "~~/services/liveMap/preview/kinds/previewKind";
import { paneFrameOf } from "~~/services/liveMap/preview/previewFrame";
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

type TokenSource = { id: string | null | undefined; data: TokenQueryData | undefined };

/** A token's symbol and decimals when the pane has read it (the governed token, USDC); null otherwise. */
const tokenNamer =
  (sources: readonly TokenSource[]): PreviewContext["tokenOf"] =>
  tokenId => {
    const data = sources.find(source => source.id === tokenId)?.data;
    return data ? { symbol: data.token.symbol, decimals: data.decimals } : null;
  };

/**
 * Everything the map pane draws, from one world. `useMapSnapshot` composes the queries the rail polls
 * too; this only adds the governed token and USDC for the strip's symbols and decimals (`useToken`, the
 * same query the snapshot reads the token's pause state from, so one request serves both). It plays
 * what changed between two reads (`useProposalAnimationSync`), so while a sequence plays the map and
 * the figures show the world it started from, and catch up when it lands. A signature this session did
 * not send is announced through `onRemoteSignature` as well as played. The selection (`useMapSelection`)
 * opens the inspector, explained from the same map; the map starting to show something else (another
 * proposal, the wizard) closes it. What the map previews and says about it comes from `useMapPreview`;
 * while a sequence plays the preview waits, so one layer moves at a time.
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

  const mapPreview = useMapPreview(config);
  const previewed = playing ? null : (mapPreview.preview?.operation ?? null);
  const composedWorld = useMemo(() => world && { ...world, previewed }, [world, previewed]);
  const map = useComposedMap(config, composedWorld);
  const nodeStates = nodeStatesShown(playing, world);
  const vaultReleases = useMemo(
    () => ({
      first: findDeployment(targetNetwork.id, GOVERNANCE_CONTRACTS.vaultFirstImplementation)?.address,
      next: findDeployment(targetNetwork.id, GOVERNANCE_CONTRACTS.vaultNextImplementation)?.address,
    }),
    [targetNetwork.id],
  );
  const previewContext = useMemo<PreviewContext | null>(
    () =>
      world && {
        council: world.council,
        vaultReleaseOf: implementation => releaseOf(implementation, vaultReleases),
        tokenOf: tokenNamer([
          { id: demoTokenId, data: governedToken.data },
          { id: usdcTokenId, data: usdc.data },
        ]),
      },
    [world, vaultReleases, demoTokenId, governedToken.data, usdcTokenId, usdc.data],
  );
  const frame = useMemo(
    () =>
      map && world && previewContext
        ? paneFrameOf(playing, mapPreview.preview, { graph: map.graph, world, context: previewContext })
        : REST_FRAME,
    [map, world, previewContext, playing, mapPreview.preview],
  );
  // The caption says what the map shows, never half a path: while a sequence plays the preview waits,
  // and a preview the map cannot route draws nothing, so both say what a target with no preview says.
  const previewDrawn = !playing && frame.scope !== null;
  const captionFacts = captionFactsOf(mapPreview.target, previewDrawn ? mapPreview.preview : null, mapPreview.title);
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
  // The map starting to show something else (a proposal picked on the rail, the wizard) moves the
  // reader's attention there, so the card over the map goes.
  useEffect(() => {
    dismiss();
  }, [mapPreview.targetKey, dismiss]);
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
    caption: world && mapCaptionOf(captionFacts, councilRuleLabel(world.council)),
    frame,
    error,
    inspector,
    selection: { activation, inspectorId, close, paneRef, onKeyDown },
  };
}
