/**
 * The order the map plays what changed on the ledger in: one event at a time, oldest first, each
 * played once however often a read reports it. Pure, so the ordering rules are tested without React
 * or timers; `useProposalAnimationSync` owns the clock that walks it.
 *
 * While anything plays, the map shows a held world — the one before the events being played — and
 * lets the ledger's newer reads wait until the sequence has landed: the money shot is never cut
 * short by a poll. A new read only adds to the queue. If the queue grows past `MAX_QUEUED`, the map
 * has fallen too far behind to replay it, so it drops what is waiting and shows where things are now.
 */
import { type AnimationEvent, type GovernanceSnapshot, animationEventKey } from "~~/services/governance/mapEvents";

/** How many events may wait behind the one playing before the map gives up replaying them. */
export const MAX_QUEUED = 6;

export type QueuedEvent = {
  key: string;
  event: AnimationEvent;
  /** The snapshot the event was read in. */
  world: GovernanceSnapshot;
  /** Which read it came from: the held world only moves on between reads, never within one. */
  read: number;
};

export type AnimationQueue = {
  /** The first is the one playing. */
  queue: QueuedEvent[];
  /** Council changes waiting for the run of the rotation that installed them. */
  parked: QueuedEvent[];
  /** Every event ever queued, parked or dropped, so a read that repeats one does not replay it. */
  seen: string[];
  /** The world shown while the queue plays; null while it is empty. */
  held: GovernanceSnapshot | null;
  /** The step of the playing event's sequence. */
  step: number;
  reads: number;
};

export const EMPTY_QUEUE: AnimationQueue = { queue: [], parked: [], seen: [], held: null, step: 0, reads: 0 };

export type QueueAction =
  | {
      type: "read";
      events: readonly AnimationEvent[];
      /** The snapshot the events lead from, which is what the map shows while they play. */
      previous: GovernanceSnapshot | null;
      world: GovernanceSnapshot;
    }
  | { type: "nextStep"; key: string; step: number }
  | { type: "finish"; key: string };

/**
 * A rotation's council change can be read one poll before the rotation's own outcome, since a
 * settled proposal re-reads the council at once. It waits until the outcome is known — and so its
 * `executed` event queued ahead of it, or dropped as too old — or the rotation left the inbox.
 */
function waitsForItsRun({ event }: QueuedEvent, world: GovernanceSnapshot): boolean {
  if (event.kind !== "councilChanged" || event.scheduleId === null) return false;
  const rotation = world.proposals.find(({ schedule }) => schedule.schedule_id === event.scheduleId);
  return rotation?.execution.status === "unconfirmed";
}

function onRead(state: AnimationQueue, action: Extract<QueueAction, { type: "read" }>): AnimationQueue {
  const { events, previous, world } = action;
  const read = state.reads + 1;
  const arrived = events
    .map(event => ({ key: animationEventKey(event), event, world, read }))
    .filter(({ key }) => !state.seen.includes(key));
  const released = state.parked
    .filter(entry => !waitsForItsRun(entry, world))
    .map(entry => ({ ...entry, world, read }));
  if (arrived.length === 0 && released.length === 0) return state;

  const seen = [...state.seen, ...arrived.map(({ key }) => key)];
  const parked = [
    ...state.parked.filter(entry => waitsForItsRun(entry, world)),
    ...arrived.filter(entry => waitsForItsRun(entry, world)),
  ];
  // Released changes go last: the run they wait for was queued by this read or an earlier one.
  const waiting = [...state.queue.slice(1), ...arrived.filter(entry => !waitsForItsRun(entry, world)), ...released];
  if (waiting.length > MAX_QUEUED) {
    const playing = state.queue.slice(0, 1);
    return { ...state, queue: playing, parked: [], seen, held: playing.length ? state.held : null, reads: read };
  }

  const queue = [...state.queue.slice(0, 1), ...waiting];
  const held = state.queue.length > 0 ? state.held : (previous ?? world);
  return { ...state, queue, parked, seen, held: queue.length > 0 ? held : null, reads: read };
}

function onFinish(state: AnimationQueue, key: string): AnimationQueue {
  const [finished, next, ...rest] = state.queue;
  if (finished?.key !== key) return state;
  if (!next) return { ...state, queue: [], held: null, step: 0 };
  // Between reads the held world moves on to the one the finished event was read in.
  const held = next.read === finished.read ? state.held : finished.world;
  return { ...state, queue: [next, ...rest], held, step: 0 };
}

export function animationQueueReducer(state: AnimationQueue, action: QueueAction): AnimationQueue {
  switch (action.type) {
    case "read":
      return onRead(state, action);
    case "nextStep":
      return state.queue[0]?.key === action.key && state.step === action.step
        ? { ...state, step: state.step + 1 }
        : state;
    case "finish":
      return onFinish(state, action.key);
  }
}
