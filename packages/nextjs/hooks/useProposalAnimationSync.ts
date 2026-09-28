"use client";

import { useEffect, useMemo, useReducer } from "react";
import { type AnimationEvent, type GovernanceSnapshot, animationEventKey } from "~~/services/liveMap/events/mapEvents";
import type { PlayingEvent } from "~~/services/liveMap/motion/frame";
import { EMPTY_QUEUE, animationQueueReducer, councilShown } from "~~/services/liveMap/motion/queue";
import { sequenceOf } from "~~/services/liveMap/motion/sequences";
import { proposalIn } from "~~/services/liveMap/motion/world";

export type AnimationSyncInput = {
  /** The latest read (`useMapSnapshot`). */
  snapshot: GovernanceSnapshot | null;
  /** The read `events` lead from. */
  previous: GovernanceSnapshot | null;
  events: readonly AnimationEvent[];
  /**
   * When the latest answer arrived. A poll that finds nothing new keeps `snapshot` as it was, and it
   * still has to count, or a council change waiting for an outcome Mirror never confirms waits forever.
   */
  readAt?: number;
};

/**
 * Plays what changed on the ledger, one event at a time: poll → diff → play. It returns the world the
 * map should draw — the held one while a sequence plays, the latest read otherwise — and the event
 * being played with the cue it is at (`frameOf` turns that into what the map shows).
 *
 * Nothing here is a copy of server state: the queue holds events and the snapshots they were read in,
 * and every frame is derived from them. The one timer lives in one effect, keyed on the step it ends,
 * and is cleared on unmount or when the step changes.
 */
export function useProposalAnimationSync({ snapshot, previous, events, readAt }: AnimationSyncInput) {
  const [state, dispatch] = useReducer(animationQueueReducer, EMPTY_QUEUE);

  // `events` is a new array only when a new read arrives, and `[]` on most of them; a read with no
  // events still matters, since it can release a council change waiting for its rotation's outcome,
  // and so does an answer that changed nothing (`readAt`), which counts towards `MAX_PARKED_READS`.
  // Under StrictMode this runs twice, which the queue's dedupe makes harmless.
  useEffect(() => {
    if (snapshot) dispatch({ type: "read", events, previous, world: snapshot });
  }, [events, previous, snapshot, readAt]);

  const current = state.queue[0] ?? null;
  const steps = useMemo(
    () =>
      current
        ? sequenceOf(
            current.event,
            proposalIn(state.held, current.event.scheduleId) ?? proposalIn(current.world, current.event.scheduleId),
          )
        : [],
    [current, state.held],
  );
  const step = steps[state.step];
  const isLastStep = state.step >= steps.length - 1;

  useEffect(() => {
    if (!current) return;
    const { key } = current;
    const ends = state.step;
    // A sequence with nothing to show ends at once, through the same timer.
    const timer = setTimeout(
      () => dispatch(isLastStep ? { type: "finish", key } : { type: "nextStep", key, step: ends }),
      step?.ms ?? 0,
    );
    return () => clearTimeout(timer);
  }, [current, state.step, step, isLastStep]);

  // Between a read arriving and its events being queued there is one render; it still shows the
  // world before them, so the new state is never drawn before the sequence that leads to it.
  const hasUnqueued = events.some(event => !state.seen.includes(animationEventKey(event)));
  const base = current ? state.held : hasUnqueued ? previous : snapshot;
  // A council change that has not played yet leaves the council it replaces on the map.
  const council = councilShown(state);
  const world = useMemo(() => (base && council ? { ...base, council } : base), [base, council]);
  const playing: PlayingEvent | null =
    current && step ? { event: current.event, cue: step.cue, world: current.world } : null;

  return { world, playing };
}
