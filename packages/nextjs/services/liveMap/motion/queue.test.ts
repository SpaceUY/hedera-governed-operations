import {
  ALICE,
  BOB,
  CAROL,
  COUNCIL,
  INCOMING,
  ROTATION,
  SUCCEEDED,
  TRANSFER,
  ago,
  proposal,
  world,
} from "./motionFixtures";
import {
  type AnimationQueue,
  EMPTY_QUEUE,
  MAX_PARKED_READS,
  MAX_QUEUED,
  type QueueAction,
  animationQueueReducer,
  busyScheduleIds,
  councilShown,
} from "./queue";
import { describe, expect, it } from "vitest";
import type { AnimationEvent, GovernanceSnapshot } from "~~/services/liveMap/events/mapEvents";

const BEFORE = world([proposal({ id: "0.0.1", operation: TRANSFER })]);
const AFTER = world([proposal({ id: "0.0.1", operation: TRANSFER, signatures: [[ALICE, ago(5)]] })]);
const LATER = world([
  proposal({
    id: "0.0.1",
    operation: TRANSFER,
    signatures: [
      [ALICE, ago(5)],
      [BOB, ago(2)],
    ],
  }),
]);

const approved = (memberKey: string, scheduleId = "0.0.1"): AnimationEvent => ({
  kind: "approved",
  scheduleId,
  memberKey,
  at: ago(2),
});

function run(...actions: QueueAction[]): AnimationQueue {
  return actions.reduce(animationQueueReducer, EMPTY_QUEUE);
}

const read = (events: AnimationEvent[], previous: GovernanceSnapshot, next: GovernanceSnapshot): QueueAction => ({
  type: "read",
  events,
  previous,
  world: next,
});

const keys = (state: AnimationQueue) => state.queue.map(({ key }) => key);

describe("animationQueueReducer", () => {
  it("queues what a read reports and holds the world it leads from", () => {
    const state = run(read([approved(ALICE)], BEFORE, AFTER));
    expect(keys(state)).toEqual(["approved:0.0.1:YWxpY2U="]);
    expect(state.held).toBe(BEFORE);
    expect(state.queue[0].world).toBe(AFTER);
  });

  it("plays an event once, however many times a read reports it", () => {
    const once = run(read([approved(ALICE)], BEFORE, AFTER));
    // StrictMode runs the enqueueing effect twice, and a later read can report the same change again.
    expect(animationQueueReducer(once, read([approved(ALICE)], BEFORE, AFTER))).toBe(once);
    const finished = animationQueueReducer(once, { type: "finish", key: once.queue[0].key });
    expect(animationQueueReducer(finished, read([approved(ALICE)], AFTER, LATER)).queue).toEqual([]);
  });

  it("leaves the state untouched by a read with nothing new", () => {
    const state = run(read([approved(ALICE)], BEFORE, AFTER));
    expect(animationQueueReducer(state, read([], AFTER, LATER))).toBe(state);
  });

  it("adds a newer read behind the one playing, without cutting it short or moving the held world", () => {
    const playing = run(read([approved(ALICE)], BEFORE, AFTER), {
      type: "nextStep",
      key: "approved:0.0.1:YWxpY2U=",
      step: 0,
    });
    const state = animationQueueReducer(playing, read([approved(BOB)], AFTER, LATER));
    expect(keys(state)).toEqual(["approved:0.0.1:YWxpY2U=", "approved:0.0.1:Ym9i"]);
    expect(state.step).toBe(1);
    expect(state.held).toBe(BEFORE);
  });

  it("ignores a timer that fires for a step or an event that is no longer playing", () => {
    const state = run(read([approved(ALICE)], BEFORE, AFTER));
    expect(animationQueueReducer(state, { type: "nextStep", key: "approved:0.0.1:YWxpY2U=", step: 3 })).toBe(state);
    expect(animationQueueReducer(state, { type: "finish", key: "approved:0.0.1:Ym9i" })).toBe(state);
  });

  it("moves the held world on between reads, never within one", () => {
    const [aliceKey, carolKey, bobKey] = ["approved:0.0.1:YWxpY2U=", "approved:0.0.1:Y2Fyb2w=", "approved:0.0.1:Ym9i"];
    let state = run(read([approved(ALICE), approved(CAROL)], BEFORE, AFTER), read([approved(BOB)], AFTER, LATER));
    expect(keys(state)).toEqual([aliceKey, carolKey, bobKey]);

    state = animationQueueReducer(state, { type: "finish", key: aliceKey });
    expect(state.held).toBe(BEFORE);
    expect(state.step).toBe(0);
    state = animationQueueReducer(state, { type: "finish", key: carolKey });
    expect(state.held).toBe(AFTER);
    state = animationQueueReducer(state, { type: "finish", key: bobKey });
    expect(state).toMatchObject({ queue: [], held: null });
  });

  it("keeps a landed run's figures and node states for the next event of its read, and nothing else", () => {
    const ran = {
      ...world([proposal({ id: "0.0.1", operation: TRANSFER, executedAt: ago(2), execution: SUCCEEDED })]),
      treasury: { ...BEFORE.treasury!, hbarBalanceTinybar: 60 },
      nodeStates: { vaultImplementation: null, tokenPaused: true },
    };
    const executed: AnimationEvent = { kind: "executed", scheduleId: "0.0.1", at: ago(2) };
    let state = run(read([executed, approved(BOB, "0.0.2")], BEFORE, ran));
    state = animationQueueReducer(state, { type: "finish", key: state.queue[0].key });
    expect(state.held).toEqual({ ...BEFORE, treasury: ran.treasury, nodeStates: ran.nodeStates });
  });

  describe("a rotation's council change", () => {
    const pendingRun = world([
      proposal({ id: "0.0.7", operation: ROTATION, executedAt: ago(3), execution: { status: "unconfirmed" } }),
    ]);
    const confirmedRun = world(
      [proposal({ id: "0.0.7", operation: ROTATION, executedAt: ago(3), execution: SUCCEEDED })],
      INCOMING,
    );
    const changed: AnimationEvent = { kind: "councilChanged", scheduleId: "0.0.7", at: ago(3), council: INCOMING };
    const executed: AnimationEvent = { kind: "executed", scheduleId: "0.0.7", at: ago(3) };

    it("waits while the rotation's outcome is unread, then plays after its run", () => {
      const parked = run(read([changed], BEFORE, pendingRun));
      expect(parked.queue).toEqual([]);
      expect(parked.parked.map(({ key }) => key)).toEqual(["councilChanged:0.0.7:2/YWxpY2U=,Ym9i,ZGF2ZQ=="]);

      const released = animationQueueReducer(parked, read([executed], pendingRun, confirmedRun));
      expect(keys(released)).toEqual(["executed:0.0.7:", "councilChanged:0.0.7:2/YWxpY2U=,Ym9i,ZGF2ZQ=="]);
      expect(released.parked).toEqual([]);
      // Both belong to the read that confirmed the run, so the world swaps once, after both.
      expect(new Set(released.queue.map(({ read: from }) => from)).size).toBe(1);
    });

    it("is released by a read that reports nothing, once the outcome is known", () => {
      const parked = run(read([changed], BEFORE, pendingRun));
      expect(keys(animationQueueReducer(parked, read([], pendingRun, confirmedRun)))).toEqual([
        "councilChanged:0.0.7:2/YWxpY2U=,Ym9i,ZGF2ZQ==",
      ]);
    });

    it("keeps the council it replaces on the map until it plays, and shows the new one while it does", () => {
      // The read that parks it already has the new council; the map must not show it yet.
      const parkedWorld = { ...pendingRun, council: INCOMING };
      const parked = run(read([changed], BEFORE, parkedWorld));
      expect(councilShown(parked)).toEqual(COUNCIL);
      expect(councilShown(animationQueueReducer(parked, read([], parkedWorld, parkedWorld)))).toEqual(COUNCIL);

      let state = animationQueueReducer(parked, read([executed], parkedWorld, confirmedRun));
      expect(keys(state)[0]).toBe("executed:0.0.7:");
      expect(councilShown(state)).toEqual(COUNCIL);
      state = animationQueueReducer(state, { type: "finish", key: "executed:0.0.7:" });
      expect(councilShown(state)).toEqual(INCOMING);
      state = animationQueueReducer(state, { type: "finish", key: keys(state)[0] });
      expect(councilShown(state)).toBeUndefined();
    });

    it("stops waiting after a bounded number of reads, so an outcome never confirmed cannot freeze the map", () => {
      let state = run(read([changed], BEFORE, pendingRun));
      for (let reads = 1; reads < MAX_PARKED_READS; reads++) {
        state = animationQueueReducer(state, read([], pendingRun, pendingRun));
        expect(state.parked).toHaveLength(1);
      }
      state = animationQueueReducer(state, read([], pendingRun, pendingRun));
      expect(state.parked).toEqual([]);
      expect(keys(state)).toEqual(["councilChanged:0.0.7:2/YWxpY2U=,Ym9i,ZGF2ZQ=="]);
      expect(councilShown(state)).toEqual(INCOMING);
    });

    it("drops the held council with everything else when the queue gives up", () => {
      const parked = run(read([changed], BEFORE, pendingRun));
      const flood = Array.from({ length: MAX_QUEUED + 2 }, (_unused, index) => approved(ALICE, `0.0.${200 + index}`));
      expect(councilShown(animationQueueReducer(parked, read(flood, pendingRun, pendingRun)))).toBeUndefined();
    });

    it("plays at once when nobody can date it", () => {
      const undated: AnimationEvent = { kind: "councilChanged", scheduleId: null, at: null, council: INCOMING };
      expect(run(read([undated], BEFORE, pendingRun)).queue).toHaveLength(1);
    });
  });

  it("gives up replaying when too much waits, and shows where things are now", () => {
    const flood = Array.from({ length: MAX_QUEUED + 2 }, (_unused, index) => approved(ALICE, `0.0.${100 + index}`));
    const idle = run(read(flood, BEFORE, AFTER));
    expect(idle).toMatchObject({ queue: [], held: null });
    expect(idle.seen).toHaveLength(flood.length);

    const playing = run(read([approved(BOB)], BEFORE, AFTER), read(flood, AFTER, LATER));
    expect(keys(playing)).toEqual(["approved:0.0.1:Ym9i"]);
    expect(playing.held).toBe(BEFORE);
  });
});

describe("busyScheduleIds", () => {
  it("is empty while nothing plays", () => {
    expect(busyScheduleIds(EMPTY_QUEUE)).toEqual([]);
  });

  it("names each proposal with an event playing or waiting, once, the playing one first", () => {
    const state = run(read([approved(ALICE, "0.0.2"), approved(BOB), approved(ALICE)], BEFORE, AFTER));
    expect(busyScheduleIds(state)).toEqual(["0.0.2", "0.0.1"]);
  });

  it("names a council change that waits for its rotation's run", () => {
    const pendingRun = world([
      proposal({ id: "0.0.7", operation: ROTATION, executedAt: ago(3), execution: { status: "unconfirmed" } }),
    ]);
    const changed: AnimationEvent = { kind: "councilChanged", scheduleId: "0.0.7", at: ago(3), council: INCOMING };
    expect(busyScheduleIds(run(read([changed], BEFORE, pendingRun)))).toEqual(["0.0.7"]);
  });

  it("empties once the queue has played out", () => {
    const playing = run(read([approved(ALICE)], BEFORE, AFTER));
    const done = animationQueueReducer(playing, { type: "finish", key: playing.queue[0].key });
    expect(busyScheduleIds(done)).toEqual([]);
  });

  it("never names what the queue dropped when it gave up on a backlog", () => {
    const flood = Array.from({ length: MAX_QUEUED + 2 }, (_unused, index) => approved(ALICE, `0.0.${100 + index}`));
    expect(busyScheduleIds(run(read(flood, BEFORE, AFTER)))).toEqual([]);
    const playing = run(read([approved(BOB)], BEFORE, AFTER), read(flood, AFTER, LATER));
    expect(busyScheduleIds(playing)).toEqual(["0.0.1"]);
  });
});
