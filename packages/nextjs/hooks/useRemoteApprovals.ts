"use client";

import { useEffect, useMemo, useRef } from "react";
import { GOVERNANCE_MUTATION_KEYS } from "./governanceMutationKeys";
import { useAccount } from "./mirror/useAccount";
import { useHederaSigner } from "./useHederaSigner";
import { memberKeyOfAccount } from "@sh/core/governance/council";
import { useMutationState } from "@tanstack/react-query";
import { type AnimationEvent, type GovernanceSnapshot, animationEventKey } from "~~/services/liveMap/events/mapEvents";
import {
  type ApprovedEvent,
  type SessionWrites,
  type SignedAs,
  remoteApprovals,
} from "~~/services/liveMap/remoteApprovals";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

type RemoteApprovalsInput = {
  /** The events of the latest read (`useMapSnapshot`). */
  events: readonly AnimationEvent[];
  /** The read they were diffed into. */
  world: GovernanceSnapshot | null;
  /** Where the connected account's key is read. */
  network: HederaNetworkName;
  /** Called once for each approval this session did not send. */
  onRemote: (approval: ApprovedEvent) => void;
};

/** The schedule a sign mutation was called with, when its variables are one. */
export const signedScheduleIdOf = (variables: unknown): string | undefined =>
  typeof variables === "string" ? variables : undefined;

/** The schedule and seat a sign-as mutation was called with, when its variables carry both. */
export function signedAsOf(variables: unknown): SignedAs | undefined {
  if (typeof variables !== "object" || variables === null) return undefined;
  if (!("scheduleId" in variables) || !("memberKey" in variables)) return undefined;
  const { scheduleId, memberKey } = variables;
  return typeof scheduleId === "string" && typeof memberKey === "string" ? { scheduleId, memberKey } : undefined;
}

/** The schedule an open mutation returned, when its result names one. */
export function openedScheduleIdOf(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null || !("scheduleId" in data)) return undefined;
  return typeof data.scheduleId === "string" ? data.scheduleId : undefined;
}

/**
 * Calls `onRemote` for every approval a read reports that did not come from this session: a council
 * member signing from another device, the co-signing agent, anyone. What this session sent is read
 * from its own mutations in the query cache — signing, asking the server to sign for a demo co-signer,
 * and opening a proposal, whose creator's approval arrives with it — so nothing here keeps state about
 * the ledger. Each approval is judged once, when it is first seen, so a mutation that resolves or
 * expires later never re-announces it.
 * Which approvals are the connected account's is told by its key, read once from the Mirror Node.
 */
export function useRemoteApprovals({ events, world, network, onRemote }: RemoteApprovalsInput) {
  const { accountId } = useHederaSigner();
  const account = useAccount(accountId, { network });
  const memberKey = account.data ? memberKeyOfAccount(account.data.key) : null;
  const signed = useMutationState({
    filters: { mutationKey: GOVERNANCE_MUTATION_KEYS.sign },
    select: ({ state }) => (state.status === "error" ? null : signedScheduleIdOf(state.variables)),
  });
  const signedAs = useMutationState({
    filters: { mutationKey: GOVERNANCE_MUTATION_KEYS.signAs },
    select: ({ state }) => (state.status === "error" ? null : (signedAsOf(state.variables) ?? null)),
  });
  const opens = useMutationState({
    filters: { mutationKey: GOVERNANCE_MUTATION_KEYS.open },
    select: ({ state }) => ({
      status: state.status,
      scheduleId: openedScheduleIdOf(state.data),
    }),
  });

  const session = useMemo<SessionWrites>(
    () => ({
      accountId: accountId ?? null,
      memberKey,
      signed: signed.flatMap(scheduleId => (scheduleId ? [scheduleId] : [])),
      signedAs: signedAs.flatMap(own => (own ? [own] : [])),
      opened: opens.flatMap(({ scheduleId }) => (scheduleId ? [scheduleId] : [])),
      opening: opens.some(({ status }) => status === "pending"),
    }),
    [accountId, memberKey, signed, signedAs, opens],
  );

  const judged = useRef(new Set<string>());
  useEffect(() => {
    if (!world) return;
    const remote = new Set(remoteApprovals(events, session, world));
    for (const event of events) {
      const key = animationEventKey(event);
      if (event.kind !== "approved" || judged.current.has(key)) continue;
      judged.current.add(key);
      if (remote.has(event)) onRemote(event);
    }
  }, [events, world, session, onRemote]);
}
