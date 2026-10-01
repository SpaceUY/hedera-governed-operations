"use client";

import { type ReactNode, createContext, useContext, useMemo } from "react";
import type { CouncilKey } from "@sh/core/governance/council";
import type { Proposal } from "@sh/core/governance/proposals";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { useMapSnapshot } from "~~/hooks/mirror/useMapSnapshot";
import { useProposalAnimationSync } from "~~/hooks/useProposalAnimationSync";
import { useSignatureInFlight } from "~~/hooks/useSignProposal";
import { proposalShown, proposalsShown } from "~~/services/liveMap/motion/world";
import { SAUCERSWAP_V2_CONFIG } from "~~/services/swap/saucerSwapConfig";

type MapPlaybackValue = ReturnType<typeof useMapSnapshot> & ReturnType<typeof useProposalAnimationSync>;

const MapPlaybackContext = createContext<MapPlaybackValue | null>(null);

type MapPlaybackProviderProps = { config: GovernanceConfig; children: ReactNode };

/**
 * The map's reads and what it is playing, once for the whole layout: the map pane draws them, and the
 * rail shows a proposal the map is still playing as the map draws it, so the two panes change together.
 */
export const MapPlaybackProvider = ({ config, children }: MapPlaybackProviderProps) => {
  const { governanceAccountId, network, executor, vault, demoTokenId } = config;
  const { snapshot, previous, events, readAt, error } = useMapSnapshot({
    governanceAccountId,
    executorContractId: executor.hederaContractId,
    network,
    vaultContractId: vault.hederaContractId,
    demoTokenId,
    usdcTokenId: SAUCERSWAP_V2_CONFIG[network].usdcToken,
  });
  const { world, playing, busy } = useProposalAnimationSync({ snapshot, previous, events, readAt });
  const value = useMemo(
    () => ({ snapshot, previous, events, readAt, error, world, playing, busy }),
    [snapshot, previous, events, readAt, error, world, playing, busy],
  );
  return <MapPlaybackContext.Provider value={value}>{children}</MapPlaybackContext.Provider>;
};

/** The map's reads and playback; only a screen inside the governance layout can ask for them. */
export function useMapPlayback(): MapPlaybackValue {
  const value = useContext(MapPlaybackContext);
  if (!value) throw new Error("useMapPlayback must be used inside the governance layout");
  return value;
}

type ShownProposal = {
  proposal: Proposal;
  isPlaying: boolean;
  /** While the map plays the proposal, the council it draws: a rotation's new seats only appear with its run. */
  council: CouncilKey | undefined;
};

/**
 * A proposal as the rail shows it, and whether the map is still playing it. It is held as the map draws
 * it while the map plays it, and also while this session's signature on it is on its way: the detail's
 * own lookup can read the signature before the map's inbox does, and would otherwise show it, then the
 * held copy, then the run.
 */
export function useShownProposal(proposal: Proposal): ShownProposal {
  const { busy, world } = useMapPlayback();
  const scheduleId = proposal.schedule.schedule_id;
  const signing = useSignatureInFlight(scheduleId);
  const isPlaying = busy.includes(scheduleId);
  const held = isPlaying || signing ? [scheduleId] : [];
  return {
    proposal: proposalShown(proposal, { busy: held, shown: world }),
    isPlaying,
    council: isPlaying ? world?.council : undefined,
  };
}

/** The rail's lists, each proposal the map is still playing shown as the map draws it. */
export function useShownProposals(proposals: readonly Proposal[]): Proposal[] {
  const { busy, world } = useMapPlayback();
  return useMemo(() => proposalsShown(proposals, { busy, shown: world }), [proposals, busy, world]);
}
