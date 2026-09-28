"use client";

import { useMemo, useState } from "react";
import { getDefaultMirrorNetwork } from "./mirrorQuery";
import { type ProposalsOptions, useProposals } from "./useProposals";
import { useTreasuryFigures } from "./useTreasuryFigures";
import { type AnimationEvent, type GovernanceSnapshot, diffSnapshots } from "~~/services/governance/mapEvents";

export type MapSnapshotOptions = ProposalsOptions & {
  vaultContractId: string;
  demoTokenId: string;
  usdcTokenId: string;
};

/**
 * Two consecutive snapshots of one world, and when the second was read. `world` names the accounts
 * and network the snapshots were read for: pointing the hook at another one starts over rather than
 * diffing two unrelated ledgers.
 */
type SnapshotHistory = {
  world: string;
  previous: GovernanceSnapshot | null;
  current: GovernanceSnapshot | null;
  readAt: number;
};

const NO_EVENTS: AnimationEvent[] = [];

/**
 * The governance world as one comparable snapshot, and the events that led from the previous one to
 * it. It reads nothing of its own: the inbox, the council and the treasury figures are the queries
 * the rest of the screen already polls, so the map and the rail never disagree about what was read.
 *
 * The first snapshot only seeds the history — nothing on the map happened while it was being
 * opened — and `events` is a new array only when a new snapshot arrives, so a consumer enqueues it
 * from an effect keyed on it. Development builds run such an effect twice under `StrictMode`, which
 * is why events are deduped by `animationEventKey` rather than trusted to arrive once.
 *
 * The previous snapshot is kept in state and replaced during render when the reads change, the
 * pattern React documents for "storing information from previous renders": a ref would have to be
 * read during render, and an effect would add a render showing the new snapshot with no events.
 */
export function useMapSnapshot({ vaultContractId, demoTokenId, usdcTokenId, ...options }: MapSnapshotOptions) {
  const { governanceAccountId, executorContractId } = options;
  const network = options.network ?? getDefaultMirrorNetwork();
  const { inbox, council } = useProposals(options);
  const treasury = useTreasuryFigures({
    governanceAccountId,
    vaultContractId,
    demoTokenId,
    usdcTokenId,
    network,
    enabled: options.enabled,
  });

  const snapshot = useMemo<GovernanceSnapshot | null>(() => {
    if (!council.data || !inbox.data) return null;
    return {
      council: council.data.key,
      proposers: council.data.proposers,
      proposals: inbox.data.proposals,
      unreachableProposers: inbox.data.unreachableProposers,
      treasury: treasury.data ?? null,
    };
  }, [council.data, inbox.data, treasury.data]);

  const world = `${network}:${governanceAccountId}:${executorContractId}`;
  const readAt = Math.max(council.dataUpdatedAt, inbox.dataUpdatedAt, treasury.dataUpdatedAt);
  const [history, setHistory] = useState<SnapshotHistory>({ world, previous: null, current: snapshot, readAt });

  if (history.world !== world) {
    setHistory({ world, previous: null, current: snapshot, readAt });
  } else if (snapshot && snapshot !== history.current) {
    // A read in flight (a new inbox key after the proposers changed) leaves the last snapshot standing.
    setHistory({ world, previous: history.current, current: snapshot, readAt });
  }

  const events = useMemo(
    () =>
      history.previous && history.current
        ? diffSnapshots(history.previous, history.current, new Date(history.readAt))
        : NO_EVENTS,
    [history],
  );

  // `previous` is the world `events` lead from, which a map shows while it plays them; `error` is the
  // council's, the one read without which there is nothing to draw.
  return { snapshot: history.current, previous: history.previous, events, error: council.error };
}
