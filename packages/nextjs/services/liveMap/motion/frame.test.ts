import { type PlayingEvent, REST_FRAME, frameOf, treasuryShown } from "./frame";
import {
  ALICE,
  BOB,
  CAROL,
  SUCCEEDED,
  SUPPLIER,
  TRANSFER,
  UPGRADE_CALL,
  ago,
  graphOf,
  proposal,
  world,
} from "./motionFixtures";
import type { Cue } from "./sequences";
import { describe, expect, it } from "vitest";
import {
  EXECUTOR_NODE_ID,
  GOVERNANCE_ACCOUNT_NODE_ID,
  edgeId,
  externalNodeId,
  memberNodeId,
} from "~~/services/governance/graph";
import type { AnimationEvent, GovernanceSnapshot } from "~~/services/governance/mapEvents";

const ID = "0.0.9001";
const TO_REGISTRY = edgeId(GOVERNANCE_ACCOUNT_NODE_ID, EXECUTOR_NODE_ID);
const TO_VAULT = edgeId(EXECUTOR_NODE_ID, "vault");

const pendingUpgrade = proposal({ id: ID, operation: UPGRADE_CALL, signatures: [[ALICE, ago(20)]] });
const SHOWN = world([pendingUpgrade]);
const GRAPH = graphOf(SHOWN);

function frameAt(event: AnimationEvent, cue: Cue, read: GovernanceSnapshot = SHOWN, shown = SHOWN) {
  const playing: PlayingEvent = { event, cue, world: read };
  return frameOf(playing, { graph: graphOf(shown), shown });
}

const EXECUTED: AnimationEvent = { kind: "executed", scheduleId: ID, at: ago(1) };
const REVERTED: AnimationEvent = { kind: "reverted", scheduleId: ID, at: ago(1), result: "CONTRACT_REVERT_EXECUTED" };

describe("frameOf", () => {
  it("is the map at rest when nothing plays", () => {
    expect(frameOf(null, { graph: GRAPH, shown: SHOWN })).toBe(REST_FRAME);
  });

  it("sends a comet along the proposer's arc, then lights it and flashes the registry", () => {
    const proposed: AnimationEvent = { kind: "proposed", scheduleId: ID, at: ago(30) };
    const arc = edgeId(memberNodeId(ALICE), EXECUTOR_NODE_ID);
    const pulse = frameAt(proposed, { name: "proposerPulse" });
    expect(pulse.phases).toEqual({ [arc]: "progress" });
    expect(pulse.comets).toEqual([{ edgeId: arc, ms: 900, delayMs: 0, direction: "forward" }]);

    const flash = frameAt(proposed, { name: "registryFlash" });
    expect(flash.phases).toEqual({ [arc]: "complete" });
    expect(flash.highlights).toEqual({ [EXECUTOR_NODE_ID]: "progress" });
  });

  it("finds the arc of a proposer that holds no seat", () => {
    const opened = proposal({ id: ID, operation: UPGRADE_CALL, creator: "0.0.4001" });
    const read = world([opened]);
    const frame = frameAt({ kind: "proposed", scheduleId: ID, at: ago(30) }, { name: "proposerPulse" }, read);
    expect(Object.keys(frame.phases)).toEqual([edgeId("proposer:0.0.4001", EXECUTOR_NODE_ID)]);
  });

  it("fills the ring one approval at a time when two arrive in one read", () => {
    const read = world([
      proposal({
        id: ID,
        operation: UPGRADE_CALL,
        signatures: [
          [ALICE, ago(20)],
          [BOB, ago(10)],
          [CAROL, ago(5)],
        ],
      }),
    ]);
    const shown = world([proposal({ id: ID, operation: UPGRADE_CALL, signatures: [[ALICE, ago(20)]] })]);
    const bob: AnimationEvent = { kind: "approved", scheduleId: ID, memberKey: BOB, at: ago(10) };
    const carol: AnimationEvent = { kind: "approved", scheduleId: ID, memberKey: CAROL, at: ago(5) };

    const bobPulse = frameAt(bob, { name: "signaturePulse" }, read, shown);
    expect(bobPulse.ring).toEqual({ signed: 1, snap: false });
    expect(bobPulse.phases).toEqual({ [edgeId(memberNodeId(BOB), GOVERNANCE_ACCOUNT_NODE_ID)]: "progress" });
    expect(bobPulse.comets.map(({ ms }) => ms)).toEqual([700]);
    expect(frameAt(bob, { name: "ringFill" }, read, shown).ring).toEqual({ signed: 2, snap: false });
    expect(frameAt(carol, { name: "signaturePulse" }, read, shown).ring).toEqual({ signed: 2, snap: false });
    expect(frameAt(carol, { name: "ringFill" }, read, shown).ring).toEqual({ signed: 3, snap: false });
  });

  it("snaps the ring full before anything travels", () => {
    expect(frameAt(EXECUTED, { name: "thresholdPause" })).toMatchObject({
      ring: { signed: 2, snap: false },
      comets: [],
    });
    expect(frameAt(EXECUTED, { name: "ringSnap" }).ring).toEqual({ signed: 2, snap: true });
  });

  it("lights the path hop by hop, each comet leaving as the one before is on its way", () => {
    const first = frameAt(EXECUTED, { name: "comet", hop: 0 });
    expect(first.phases).toEqual({ [TO_REGISTRY]: "progress" });
    expect(first.comets.map(({ edgeId: id }) => id)).toEqual([TO_REGISTRY]);

    const second = frameAt(EXECUTED, { name: "comet", hop: 1 });
    expect(second.phases).toEqual({ [TO_REGISTRY]: "progress", [TO_VAULT]: "progress" });
    // The first comet is still listed, so the element that carries it keeps running rather than restarting.
    expect(second.comets.map(({ edgeId: id }) => id)).toEqual([TO_REGISTRY, TO_VAULT]);
  });

  it("flashes the target when the run arrives, then holds the path lit and relaxes it", () => {
    const arrive = frameAt(EXECUTED, { name: "arrive" });
    expect(arrive.phases).toEqual({ [TO_REGISTRY]: "complete", [TO_VAULT]: "complete" });
    expect(arrive.highlights).toEqual({ vault: "success" });
    expect(arrive.comets).toEqual([]);

    expect(frameAt(EXECUTED, { name: "hold" }).highlights).toEqual({});
    const relax = frameAt(EXECUTED, { name: "relax" });
    expect(relax.phases).toEqual({ [TO_REGISTRY]: "rest", [TO_VAULT]: "rest" });
    expect(relax.ring).toBeNull();
  });

  it("finds the path on the held world, where the proposal was still pending", () => {
    // The read it arrived in has the registry call settled, which no longer describes the upgrade.
    const read = world([proposal({ id: ID, operation: UPGRADE_CALL, executedAt: ago(1), execution: SUCCEEDED })]);
    expect(Object.keys(frameAt(EXECUTED, { name: "arrive" }, read).phases)).toEqual([TO_REGISTRY, TO_VAULT]);
  });

  it("draws a transfer's path to a recipient only the pending proposal introduced", () => {
    const transfer = world([proposal({ id: ID, operation: TRANSFER })]);
    const toRecipient = edgeId(GOVERNANCE_ACCOUNT_NODE_ID, externalNodeId(SUPPLIER));
    expect(frameAt(EXECUTED, { name: "comet", hop: 0 }, transfer, transfer).phases).toEqual({
      [toRecipient]: "progress",
    });
    // Without the pending proposal the edge does not exist, and nothing is claimed about the path.
    expect(frameAt(EXECUTED, { name: "comet", hop: 0 }, transfer, world([])).phases).toEqual({});
  });

  it("turns the path coral, shakes the target and brings the comet back, last hop first", () => {
    const fail = frameAt(REVERTED, { name: "fail" });
    expect(fail.phases).toEqual({ [TO_REGISTRY]: "failed", [TO_VAULT]: "failed" });
    expect(fail.shaking).toEqual(["vault"]);

    const retreat = frameAt(REVERTED, { name: "retreat" });
    expect(retreat.comets).toEqual([
      { edgeId: TO_REGISTRY, ms: 1100, delayMs: 480, direction: "back" },
      { edgeId: TO_VAULT, ms: 1100, delayMs: 0, direction: "back" },
    ]);
    expect(frameAt(REVERTED, { name: "hold" }).phases[TO_VAULT]).toBe("failed");
  });

  it("marks a council change on the treasury", () => {
    const changed: AnimationEvent = { kind: "councilChanged", scheduleId: null, at: null, council: SHOWN.council };
    expect(frameAt(changed, { name: "councilChanged" }).highlights).toEqual({
      [GOVERNANCE_ACCOUNT_NODE_ID]: "success",
    });
  });
});

describe("treasuryShown", () => {
  const shown = world([]);
  const latest = { ...world([]), treasury: { ...shown.treasury!, hbarBalanceTinybar: 60 } };
  const playing = (cue: Cue, event: AnimationEvent = EXECUTED): PlayingEvent => ({ event, cue, world: latest });

  it("holds the shown world's figures until the run reaches its target", () => {
    expect(treasuryShown(null, { shown, latest })).toBe(shown.treasury);
    expect(treasuryShown(playing({ name: "comet", hop: 1 }), { shown, latest })).toBe(shown.treasury);
    expect(treasuryShown(playing({ name: "arrive" }), { shown, latest })).toBe(latest.treasury);
    expect(treasuryShown(playing({ name: "relax" }), { shown, latest })).toBe(latest.treasury);
  });

  it("never lets a signature move the figures", () => {
    const approved: AnimationEvent = { kind: "approved", scheduleId: ID, memberKey: BOB, at: ago(1) };
    expect(treasuryShown(playing({ name: "ringFill" }, approved), { shown, latest })).toBe(shown.treasury);
  });
});
