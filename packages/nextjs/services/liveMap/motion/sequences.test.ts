import { ALICE, INCOMING, ROTATION, TRANSFER, UPGRADE_CALL, ago, proposal } from "./motionFixtures";
import { type Step, sequenceOf } from "./sequences";
import { MOTION_MS, travelMs } from "./timings";
import { describe, expect, it } from "vitest";
import type { AnimationEvent } from "~~/services/liveMap/events/mapEvents";

const names = (steps: Step[]) => steps.map(({ cue }) => ("hop" in cue ? `comet ${cue.hop}` : cue.name));
const total = (steps: Step[]) => steps.reduce((sum, { ms }) => sum + ms, 0);

const UPGRADE = proposal({ id: "0.0.9001", operation: UPGRADE_CALL });
const event = (kind: "proposed" | "executed" | "reverted", scheduleId = "0.0.9001"): AnimationEvent =>
  kind === "reverted"
    ? { kind, scheduleId, at: ago(1), result: "CONTRACT_REVERT_EXECUTED" }
    : { kind, scheduleId, at: ago(1) };

describe("sequenceOf", () => {
  it("pulses the proposer's arc into the registry, then flashes the registry, for a registry call", () => {
    const steps = sequenceOf(event("proposed"), UPGRADE);
    expect(names(steps)).toEqual(["proposerPulse", "registryFlash"]);
    expect(steps.map(({ ms }) => ms)).toEqual([900, 400]);
  });

  it("moves nothing on the map when a native proposal is opened", () => {
    expect(sequenceOf(event("proposed"), proposal({ id: "0.0.9001", operation: TRANSFER }))).toEqual([]);
    expect(sequenceOf(event("proposed"), undefined)).toEqual([]);
  });

  it("sends a signature to the treasury, then fills the ring", () => {
    const steps = sequenceOf({ kind: "approved", scheduleId: "0.0.9001", memberKey: ALICE, at: ago(1) }, UPGRADE);
    expect(names(steps)).toEqual(["signaturePulse", "ringFill"]);
    expect(steps.map(({ ms }) => ms)).toEqual([700, 500]);
  });

  it("reaches the threshold: beat, ring snap, a comet per hop, arrival, figures, hold, relax", () => {
    const steps = sequenceOf(event("executed"), UPGRADE);
    expect(names(steps)).toEqual([
      "thresholdPause",
      "ringSnap",
      "comet 0",
      "comet 1",
      "arrive",
      "figures",
      "hold",
      "relax",
    ]);
    // Each comet takes 1100 ms and the next leaves 480 ms after the one before.
    expect(steps.slice(2, 4).map(({ ms }) => ms)).toEqual([MOTION_MS.cometStagger, MOTION_MS.comet]);
    expect(total(steps)).toBe(150 + 260 + travelMs(2) + 400 + 700 + 2600 + 800);
  });

  it("travels one hop for a transfer and for a rotation, however many recipients or seats", () => {
    for (const operation of [TRANSFER, ROTATION]) {
      const steps = sequenceOf(event("executed"), proposal({ id: "0.0.9001", operation }));
      expect(names(steps).filter(name => name.startsWith("comet"))).toEqual(["comet 0"]);
    }
  });

  it("still plays the threshold, without a path, for a proposal the map cannot describe", () => {
    expect(names(sequenceOf(event("executed"), undefined))).toEqual([
      "thresholdPause",
      "ringSnap",
      "arrive",
      "figures",
      "hold",
      "relax",
    ]);
  });

  it("fails at the target and retreats to the treasury, taking as long to come back as to go", () => {
    const steps = sequenceOf(event("reverted"), UPGRADE);
    expect(names(steps)).toEqual([
      "thresholdPause",
      "ringSnap",
      "comet 0",
      "comet 1",
      "fail",
      "retreat",
      "hold",
      "relax",
    ]);
    expect(steps.find(({ cue }) => cue.name === "retreat")?.ms).toBe(travelMs(2));
  });

  it("marks a council change on its own", () => {
    const steps = sequenceOf({ kind: "councilChanged", scheduleId: null, at: null, council: INCOMING }, undefined);
    expect(names(steps)).toEqual(["councilChanged"]);
  });

  it("ends every sequence that lights a path by relaxing it", () => {
    for (const kind of ["executed", "reverted"] as const) {
      expect(names(sequenceOf(event(kind), UPGRADE)).at(-1)).toBe("relax");
    }
  });
});
