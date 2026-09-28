/**
 * How the map plays one event, as data: a list of cues, each held for a number of milliseconds. What
 * the map shows at a cue is `frameOf`'s business; the clock that walks the list is
 * `useProposalAnimationSync`'s. A sequence keeps its timing under reduced motion — the stylesheet
 * drops the movement, not the states — so every state is still shown long enough to read.
 */
import { MOTION_MS, travelMs } from "./timings";
import type { Proposal } from "@sh/core/governance/proposals";
import type { AnimationEvent } from "~~/services/liveMap/events/mapEvents";
import { decodedOperationOf, routeOf } from "~~/services/liveMap/model/proposalRoutes";

type TimedCue = keyof Omit<typeof MOTION_MS, "comet" | "cometStagger">;

/** One moment of a sequence. `comet` is the comet leaving along hop `hop` of the path. */
export type Cue = { name: TimedCue } | { name: "comet"; hop: number } | { name: "retreat" };

export type Step = { cue: Cue; ms: number };

const step = (name: TimedCue): Step => ({ cue: { name }, ms: MOTION_MS[name] });

/** How many hops the operation behind a proposal travels, or 0 when it cannot be described. */
function hopsOf(proposal: Proposal | undefined): number {
  return proposal ? (routeOf(decodedOperationOf(proposal))?.steps.length ?? 0) : 0;
}

/**
 * The threshold being reached: a beat, the ring snapping full, then a comet along each hop of the
 * path, the next one leaving before the last arrives.
 */
function thresholdSteps(hops: number): Step[] {
  const comets = Array.from({ length: hops }, (_unused, hop) => ({
    cue: { name: "comet", hop } as const,
    ms: hop < hops - 1 ? MOTION_MS.cometStagger : MOTION_MS.comet,
  }));
  return [step("thresholdPause"), step("ringSnap"), ...comets];
}

/**
 * The sequence an event plays. `proposal` is the proposal it concerns as the map knows it, which
 * decides how many hops the comet crosses; without one the sequence plays without a path. Every
 * sequence that lights a line ends by relaxing it: nothing stays lit.
 */
export function sequenceOf(event: AnimationEvent, proposal: Proposal | undefined): Step[] {
  switch (event.kind) {
    case "proposed":
      // A native proposal registers nothing: nothing on the map moves, the rail shows it arrive.
      return proposal?.operation.kind === "registryCall" ? [step("proposerPulse"), step("registryFlash")] : [];
    case "approved":
      return [step("signaturePulse"), step("ringFill")];
    case "executed":
      return [...thresholdSteps(hopsOf(proposal)), step("arrive"), step("figures"), step("hold"), step("relax")];
    case "reverted": {
      const hops = hopsOf(proposal);
      const retreat: Step[] = hops > 0 ? [{ cue: { name: "retreat" }, ms: travelMs(hops) }] : [];
      return [...thresholdSteps(hops), step("fail"), ...retreat, step("hold"), step("relax")];
    }
    case "councilChanged":
      return [step("councilChanged")];
  }
}
