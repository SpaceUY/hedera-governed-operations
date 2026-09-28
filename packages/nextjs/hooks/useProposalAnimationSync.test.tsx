import { type ReactNode, StrictMode } from "react";
import { type AnimationSyncInput, useProposalAnimationSync } from "./useProposalAnimationSync";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnimationEvent } from "~~/services/liveMap/events/mapEvents";
import {
  ALICE,
  BOB,
  COUNCIL,
  INCOMING,
  ROTATION,
  SUCCEEDED,
  UPGRADE_CALL,
  ago,
  proposal,
  world,
} from "~~/services/liveMap/motion/motionFixtures";
import { MAX_PARKED_READS } from "~~/services/liveMap/motion/queue";

const ID = "0.0.9001";
const OPEN = world([proposal({ id: ID, operation: UPGRADE_CALL, signatures: [[ALICE, ago(20)]] })]);
const SIGNED = world([
  proposal({
    id: ID,
    operation: UPGRADE_CALL,
    signatures: [
      [ALICE, ago(20)],
      [BOB, ago(4)],
    ],
  }),
]);
const RAN = {
  ...world([
    proposal({
      id: ID,
      operation: UPGRADE_CALL,
      signatures: [
        [ALICE, ago(20)],
        [BOB, ago(4)],
      ],
      executedAt: ago(4),
      execution: SUCCEEDED,
    }),
  ]),
  treasury: { hbarBalanceTinybar: 42, acmeBalance: 0, usdcBalance: 0, vaultReserveTinybar: 0n },
};

const BOB_SIGNED: AnimationEvent = { kind: "approved", scheduleId: ID, memberKey: BOB, at: ago(4) };
const EXECUTED: AnimationEvent = { kind: "executed", scheduleId: ID, at: ago(4) };

const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

function renderSync(initial: AnimationSyncInput) {
  return renderHook((input: AnimationSyncInput) => useProposalAnimationSync(input), { initialProps: initial, wrapper });
}

/** The cue playing, as a name, or "rest". */
function cueOf(result: { current: ReturnType<typeof useProposalAnimationSync> }): string {
  const cue = result.current.playing?.cue;
  if (!cue) return "rest";
  return "hop" in cue ? `comet ${cue.hop}` : cue.name;
}

/** Advances the clock step by step, recording each cue entered, until the queue is empty. */
function playToEnd(result: { current: ReturnType<typeof useProposalAnimationSync> }): Array<[string, number]> {
  const cues: Array<[string, number]> = [];
  let elapsed = 0;
  while (result.current.playing) {
    cues.push([cueOf(result), elapsed]);
    const before = cueOf(result);
    // Step a millisecond at a time until the cue changes: the record is the time each cue began.
    while (cueOf(result) === before && result.current.playing) {
      act(() => void vi.advanceTimersByTime(1));
      elapsed += 1;
      if (elapsed > 20_000) throw new Error("the sequence never ended");
    }
  }
  return cues;
}

beforeEach(() => void vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useProposalAnimationSync", () => {
  it("shows the latest read while nothing plays", () => {
    const { result, rerender } = renderSync({ snapshot: OPEN, previous: null, events: [] });
    expect(result.current).toEqual({ world: OPEN, playing: null });
    rerender({ snapshot: SIGNED, previous: OPEN, events: [] });
    expect(result.current.world).toBe(SIGNED);
  });

  it("plays a signature and then the run it completed, in order, and ends at rest", () => {
    const { result, rerender } = renderSync({ snapshot: OPEN, previous: null, events: [] });
    rerender({ snapshot: SIGNED, previous: OPEN, events: [BOB_SIGNED] });
    // The same poll's next read: the run and its outcome, while the signature still plays.
    act(() => void vi.advanceTimersByTime(100));
    rerender({ snapshot: RAN, previous: SIGNED, events: [EXECUTED] });

    expect(playToEnd(result)).toEqual([
      ["signaturePulse", 0],
      ["ringFill", 600],
      ["thresholdPause", 1100],
      ["ringSnap", 1250],
      ["comet 0", 1510],
      ["comet 1", 1990],
      ["arrive", 3090],
      ["figures", 3490],
      ["hold", 4190],
      ["relax", 6790],
    ]);
    expect(result.current).toEqual({ world: RAN, playing: null });
  });

  it("holds the world it started from until the sequence lands, even for the render before it is queued", () => {
    const { result, rerender } = renderSync({ snapshot: OPEN, previous: null, events: [] });
    rerender({ snapshot: SIGNED, previous: OPEN, events: [BOB_SIGNED] });
    expect(result.current.world).toBe(OPEN);
    rerender({ snapshot: RAN, previous: SIGNED, events: [EXECUTED] });

    // During the signature the map still shows the world before it.
    expect(result.current.world).toBe(OPEN);
    // One step per act: a step's timer is set once the render that entered the step has committed.
    act(() => void vi.advanceTimersByTime(700));
    act(() => void vi.advanceTimersByTime(500));
    // The run plays on the world the signature was read in, where the proposal is still pending.
    expect(cueOf(result)).toBe("thresholdPause");
    expect(result.current.world).toBe(SIGNED);
    expect(result.current.playing?.world).toBe(RAN);
  });

  it("never draws the new read before its sequence, not even in the render that queues it", () => {
    const drawn: unknown[] = [];
    const { rerender } = renderHook(
      (input: AnimationSyncInput) => {
        const synced = useProposalAnimationSync(input);
        drawn.push(synced.world);
        return synced;
      },
      { initialProps: { snapshot: OPEN, previous: null, events: [] } as AnimationSyncInput, wrapper },
    );
    drawn.length = 0;
    rerender({ snapshot: SIGNED, previous: OPEN, events: [BOB_SIGNED] });
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.every(shown => shown === OPEN)).toBe(true);
  });

  it("plays a signature read from another device exactly like one sent from here", () => {
    // Nothing distinguishes the two: the sync only ever sees what a read reports.
    const { result, rerender } = renderSync({ snapshot: OPEN, previous: null, events: [] });
    rerender({ snapshot: SIGNED, previous: OPEN, events: [BOB_SIGNED] });
    expect(playToEnd(result).map(([cue]) => cue)).toEqual(["signaturePulse", "ringFill"]);
  });

  it("keeps one timer at a time and clears it on unmount", () => {
    const { rerender, unmount } = renderSync({ snapshot: OPEN, previous: null, events: [] });
    rerender({ snapshot: SIGNED, previous: OPEN, events: [BOB_SIGNED] });
    expect(vi.getTimerCount()).toBe(1);
    rerender({ snapshot: RAN, previous: SIGNED, events: [EXECUTED] });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not replay what a later read reports again", () => {
    const { result, rerender } = renderSync({ snapshot: OPEN, previous: null, events: [] });
    rerender({ snapshot: SIGNED, previous: OPEN, events: [BOB_SIGNED] });
    playToEnd(result);
    rerender({ snapshot: { ...SIGNED }, previous: SIGNED, events: [BOB_SIGNED] });
    expect(result.current.playing).toBeNull();
  });
  it("keeps the old council on the map while a rotation's change waits for its run", () => {
    const pending = world([
      proposal({ id: "0.0.7", operation: ROTATION, executedAt: ago(3), execution: { status: "unconfirmed" } }),
    ]);
    const rotated = { ...pending, council: INCOMING };
    const changed: AnimationEvent = { kind: "councilChanged", scheduleId: "0.0.7", at: ago(3), council: INCOMING };
    const { result, rerender } = renderSync({ snapshot: pending, previous: null, events: [] });
    rerender({ snapshot: rotated, previous: pending, events: [changed] });
    expect(result.current.playing).toBeNull();
    expect(result.current.world?.council).toEqual(COUNCIL);
    expect(result.current.world?.proposals).toBe(rotated.proposals);
  });
  it("counts answers that changed nothing, so a change whose outcome never confirms still plays", () => {
    const pending = world([
      proposal({ id: "0.0.7", operation: ROTATION, executedAt: ago(3), execution: { status: "unconfirmed" } }),
    ]);
    const rotated = { ...pending, council: INCOMING };
    const changed: AnimationEvent = { kind: "councilChanged", scheduleId: "0.0.7", at: ago(3), council: INCOMING };
    const { result, rerender } = renderSync({ snapshot: pending, previous: null, events: [], readAt: 0 });
    const parked = { snapshot: rotated, previous: pending, events: [changed] };
    rerender({ ...parked, readAt: 1 });
    // Mirror answers the same thing again and again: the snapshot, and so the events, stay the same.
    for (let readAt = 2; readAt < 1 + MAX_PARKED_READS; readAt++) rerender({ ...parked, readAt });
    expect(result.current.world?.council).toEqual(COUNCIL);
    rerender({ ...parked, readAt: 1 + MAX_PARKED_READS });
    expect(result.current.world?.council).toEqual(INCOMING);
  });
});
