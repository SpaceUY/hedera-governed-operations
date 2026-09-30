/**
 * How the map plays one event, as data: a list of cues, each held for a number of milliseconds. What
 * the map shows at a cue is `frameOf`'s business; the clock that walks the list is
 * `useProposalAnimationSync`'s. A sequence keeps its timing under reduced motion — the stylesheet
 * drops the movement, not the states — so every state is still shown long enough to read.
 */
import { MOTION_MS, retreatMs } from "./timings";
import type { Proposal } from "@sh/core/governance/proposals";
import type { AnimationEvent } from "~~/services/liveMap/events/mapEvents";
import { decodedOperationOf, routeOf } from "~~/services/liveMap/model/proposalRoutes";

type TimedCueName =
  | "proposerPulse"
  | "registryFlash"
  | "signaturePulse"
  | "ringFill"
  | "thresholdPause"
  | "ringSnap"
  | "arrive"
  | "hold"
  | "relax"
  | "fail"
  | "retreat"
  | "councilChanged";

/** One moment of a sequence. `comet` is the comet leaving along hop `hop` of the path. */
export type Cue = { name: TimedCueName } | { name: "comet"; hop: number };

export type Step = { cue: Cue; ms: number };

const step = (name: TimedCueName, ms: number): Step => ({ cue: { name }, ms });

/** How many hops the operation behind a proposal travels, or 0 when it cannot be described. */
function hopsOf(proposal: Proposal | undefined): number {
  return proposal ? (routeOf(decodedOperationOf(proposal))?.steps.length ?? 0) : 0;
}

/**
 * How far a failed run travels before it turns back: to the hop before its target, where the call
 * reverted, or the one hop there is.
 */
export const failedReach = (hops: number): number => (hops > 1 ? hops - 1 : hops);

/**
 * The threshold being reached: a beat, the ring snapping full, then a comet along each hop of the
 * path, the next one leaving before the last arrives.
 */
function thresholdSteps(hops: number): Step[] {
  const comets = Array.from({ length: hops }, (_unused, hop) => ({
    cue: { name: "comet", hop } as const,
    ms: hop < hops - 1 ? MOTION_MS.cometStagger : MOTION_MS.comet,
  }));
  return [step("thresholdPause", MOTION_MS.thresholdPause), step("ringSnap", MOTION_MS.ringSnap), ...comets];
}

/**
 * The sequence an event plays. `proposal` is the proposal it concerns as the map knows it, which
 * decides how many hops the comet crosses; without one the sequence plays without a path. Every
 * sequence that lights a line ends by relaxing it: nothing stays lit. Steps overlap what they follow
 * where the choreography does — the registry flashes and the ring fills while their pulse is still
 * landing — so a signature and the run it completes play back to back without a gap.
 */
export function sequenceOf(event: AnimationEvent, proposal: Proposal | undefined): Step[] {
  switch (event.kind) {
    case "proposed":
      // A native proposal registers nothing: nothing on the map moves, the rail shows it arrive.
      return proposal?.operation.kind === "registryCall"
        ? [
            step("proposerPulse", MOTION_MS.registryFlashAt),
            step("registryFlash", MOTION_MS.proposed - MOTION_MS.registryFlashAt),
          ]
        : [];
    case "approved":
      return [
        step("signaturePulse", MOTION_MS.ringFillAt),
        step("ringFill", MOTION_MS.signaturePulse - MOTION_MS.ringFillAt),
      ];
    case "executed":
      return [
        ...thresholdSteps(hopsOf(proposal)),
        step("arrive", MOTION_MS.arrive),
        step("hold", MOTION_MS.hold - MOTION_MS.arrive),
        step("relax", MOTION_MS.relax),
      ];
    case "reverted": {
      const reach = failedReach(hopsOf(proposal));
      const retreat = reach > 0 ? [step("retreat", retreatMs(reach))] : [];
      return [
        ...thresholdSteps(reach),
        step("fail", MOTION_MS.retreatAt),
        ...retreat,
        step("hold", MOTION_MS.hold),
        step("relax", MOTION_MS.relax),
      ];
    }
    case "councilChanged":
      return [step("councilChanged", MOTION_MS.councilChanged)];
  }
}
