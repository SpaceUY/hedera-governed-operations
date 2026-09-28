import { ALICE, BOB, CAROL, INCOMING, ROTATION, SUCCEEDED, TRANSFER, ago, proposal, world } from "./motionFixtures";
import { type AnimationQueue, EMPTY_QUEUE, MAX_QUEUED, type QueueAction, animationQueueReducer } from "./queue";
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
