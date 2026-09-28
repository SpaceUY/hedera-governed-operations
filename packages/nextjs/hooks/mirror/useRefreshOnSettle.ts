"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_PENDING_POLL_MS } from "./mirrorQuery";
import { councilQueryKey } from "./useCouncil";
import { treasuryFiguresQueryKey } from "./useTreasuryFigures";
import type { Proposal } from "@sh/core/governance/proposals";
import type { ScheduleStatus } from "@sh/core/mirror";
import { type QueryKey, useQueryClient } from "@tanstack/react-query";

export type SettleScope = {
  network: string;
  governanceAccountId: string;
  executorContractId: string;
};

/**
 * What has to be re-read because these proposals just settled: the treasury always, and the council
 * too when one of them replaced it. Empty when nothing left `pending` since the previous read.
 */
export function keysToRefreshOnSettle(
  previousStatuses: ReadonlyMap<string, ScheduleStatus>,
  proposals: readonly Proposal[],
  scope: SettleScope,
): QueryKey[] {
  const settled = proposals.filter(
    proposal => previousStatuses.get(proposal.schedule.schedule_id) === "pending" && proposal.state.isSettled,
  );
  if (settled.length === 0) return [];
  const treasury = treasuryFiguresQueryKey(scope.network, scope.governanceAccountId);
  if (!settled.some(proposal => proposal.operation.kind === "councilRotation")) return [treasury];
  return [treasury, councilQueryKey(scope.network, scope.governanceAccountId, scope.executorContractId)];
}

/**
 * Re-reads the treasury figures, and the council after a rotation, when a proposal leaves `pending`,
 * so the screen shows the world the proposal left behind instead of waiting out their cache.
 *
 * The first proposals it sees only seed the comparison: a proposal already settled when the page
 * opened changed nothing since. Mirror and the relay lag consensus by seconds, so, like
 * `useProposalLookup().refresh()`, it reads once now and once more after a poll interval; the
 * delayed read is cleared on unmount.
 */
export function useRefreshOnSettle(proposals: readonly Proposal[] | undefined, scope: SettleScope) {
  const queryClient = useQueryClient();
  const previousStatuses = useRef<ReadonlyMap<string, ScheduleStatus> | null>(null);
  const delayedRefresh = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { network, governanceAccountId, executorContractId } = scope;

  useEffect(
    () => () => {
      if (delayedRefresh.current) clearTimeout(delayedRefresh.current);
    },
    [],
  );

  useEffect(() => {
    if (!proposals) return;
    const before = previousStatuses.current;
    previousStatuses.current = new Map(
      proposals.map(proposal => [proposal.schedule.schedule_id, proposal.state.status]),
    );
    if (!before) return;

    const keys = keysToRefreshOnSettle(before, proposals, { network, governanceAccountId, executorContractId });
    if (keys.length === 0) return;
    // Several screens may read the same proposals and each invalidates; `cancelRefetch: false` makes
    // the second one join a read that is already running instead of restarting it.
    const invalidate = () =>
      keys.forEach(queryKey => void queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false }));
    invalidate();
    if (delayedRefresh.current) clearTimeout(delayedRefresh.current);
    delayedRefresh.current = setTimeout(invalidate, DEFAULT_PENDING_POLL_MS);
  }, [proposals, queryClient, network, governanceAccountId, executorContractId]);
}
