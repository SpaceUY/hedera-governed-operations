/**
 * What the map shows at one cue of a sequence, on top of the graph at rest: which edges are lit and
 * in what colour, which comets travel, how full the treasury's ring is, which node flashes or shakes.
 * These are states, not movements — the movement is CSS (a comet is a dash travelling along its edge,
 * a phase change a colour transition), so reduced motion is honoured by the stylesheet alone.
 */
import { type Cue, failedReach } from "./sequences";
import { MOTION_MS } from "./timings";
import { proposalIn } from "./world";
import { memberSignedAt } from "@sh/core/governance/council";
import type { Proposal } from "@sh/core/governance/proposals";
import { compareMirrorTimestamps } from "@sh/core/mirror";
import type { TreasuryFigures } from "~~/services/governance/treasury";
import type { AnimationEvent, GovernanceSnapshot, NodeStates } from "~~/services/liveMap/events/mapEvents";
import {
  EXECUTOR_NODE_ID,
  type EdgePhase,
  GOVERNANCE_ACCOUNT_NODE_ID,
  type GovernanceGraph,
  edgeId,
  memberNodeId,
  scopeOf,
} from "~~/services/liveMap/model/graph";
import { decodedOperationOf } from "~~/services/liveMap/model/proposalRoutes";

export type NodeTone = "progress" | "success" | "error";

/** A dash travelling along an edge, `back` from its end to its start. */
export type Comet = { edgeId: string; ms: number; delayMs: number; direction: "forward" | "back" };

/** What the map shows at one moment on top of the graph at rest. */
export type MapFrame = {
  /** Phase per edge id; an intent edge is drawn only while a frame names it. */
  phases: Partial<Record<string, EdgePhase>>;
  comets: Comet[];
  /**
   * The approvals the treasury's ring shows, whether it snaps, and the colour of its filled segments:
   * amber while a signature arrives, mint once the threshold has run, coral when the run reverted,
   * and the primary colour (null) otherwise. A null ring is empty.
   */
  ring: { signed: number; snap: boolean; tone: NodeTone | null } | null;
  highlights: Partial<Record<string, NodeTone>>;
  shaking: string[];
};

export const REST_FRAME: MapFrame = { phases: {}, comets: [], ring: null, highlights: {}, shaking: [] };

/** The event being played, the cue it is at, and the snapshot it was read in. */
export type PlayingEvent = { event: AnimationEvent; cue: Cue; world: GovernanceSnapshot };

const phasesFor = (edgeIds: readonly string[], phase: EdgePhase) =>
  Object.fromEntries(edgeIds.map(id => [id, phase])) as Partial<Record<string, EdgePhase>>;

const cometsAlong = (edgeIds: readonly string[], ms: number): Comet[] =>
  edgeIds.map(id => ({ edgeId: id, ms, delayMs: 0, direction: "forward" }));

/** Current council members who had approved by `at`, strictly before it or up to it. */
function approvalsBy(proposal: Proposal, at: string, bound: "before" | "upTo"): number {
  return proposal.progress.signedBy.filter(key => {
    const signedAt = memberSignedAt(proposal.schedule, key);
    if (!signedAt) return false;
    const order = compareMirrorTimestamps(signedAt, at);
    return bound === "before" ? order < 0 : order <= 0;
  }).length;
}

/** The PROPOSER_ROLE arc of the account that opened a proposal: from its seat, or from its own node. */
function proposerArc(graph: GovernanceGraph, world: GovernanceSnapshot, accountId: string): string | undefined {
  const key = world.proposers.find(proposer => proposer.accountId === accountId)?.key;
  const seat = key ? memberNodeId(key) : undefined;
  const nodeIds = graph.nodes.filter(({ id, ref }) => id === seat || ref === accountId).map(({ id }) => id);
  return graph.edges.find(edge => edge.to === EXECUTOR_NODE_ID && nodeIds.includes(edge.from))?.id;
}

type Worlds = { graph: GovernanceGraph; shown: GovernanceSnapshot };

function proposedFrame({ cue, event, world }: PlayingEvent, graph: GovernanceGraph): MapFrame {
  const creator = proposalIn(world, event.scheduleId)?.schedule.creator_account_id;
  const arc = creator ? proposerArc(graph, world, creator) : undefined;
  const arcs = arc ? [arc] : [];
  // The pulse is still landing while the registry flashes, so both cues keep it travelling.
  const comets = cometsAlong(arcs, MOTION_MS.proposerPulse);
  if (cue.name === "proposerPulse") return { ...REST_FRAME, phases: phasesFor(arcs, "progress"), comets };
  return { ...REST_FRAME, phases: phasesFor(arcs, "complete"), comets, highlights: { [EXECUTOR_NODE_ID]: "progress" } };
}

/**
 * A member's approval: a pulse from the seat to the treasury, then the ring filling. The ring counts
 * the approvals that had reached the schedule by then, so two read together fill it one by one.
 */
function approvedFrame(
  event: Extract<AnimationEvent, { kind: "approved" }>,
  { cue, world }: PlayingEvent,
  shown: GovernanceSnapshot,
): MapFrame {
  const proposal = proposalIn(world, event.scheduleId) ?? proposalIn(shown, event.scheduleId);
  const edges = [edgeId(memberNodeId(event.memberKey), GOVERNANCE_ACCOUNT_NODE_ID)];
  // The ring fills while the pulse is still landing, so both cues keep it travelling.
  const comets = cometsAlong(edges, MOTION_MS.signaturePulse);
  if (cue.name === "signaturePulse") {
    const signed = proposal ? approvalsBy(proposal, event.at, "before") : 0;
    return {
      ...REST_FRAME,
      phases: phasesFor(edges, "progress"),
      comets,
      ring: { signed, snap: false, tone: "progress" },
    };
  }
  const signed = proposal ? approvalsBy(proposal, event.at, "upTo") : 0;
  return {
    ...REST_FRAME,
    phases: phasesFor(edges, "complete"),
    comets,
    ring: { signed, snap: false, tone: "progress" },
  };
}

/** The run of an approved proposal along its path, and its outcome at the far end. */
function runFrame({ cue, event, world }: PlayingEvent, { graph, shown }: Worlds): MapFrame {
  // The shown world still has the proposal pending, with the path its intent drew; the world it was
  // read in has it settled, which a registry call no longer describes.
  const proposal = proposalIn(shown, event.scheduleId) ?? proposalIn(world, event.scheduleId);
  const hops = (proposal && scopeOf(graph, decodedOperationOf(proposal))?.hops) || [];
  const path = hops.flat();
  const lastHop = hops.at(-1) ?? [];
  const targets = graph.edges.filter(edge => lastHop.includes(edge.id)).map(edge => edge.to);
  const ended: EdgePhase = event.kind === "reverted" ? "failed" : "complete";
  const full = { signed: shown.council.threshold, snap: false, tone: null };
  // From the snap on, the ring says how the run ended.
  const landed = { ...full, tone: event.kind === "reverted" ? "error" : "success" } as const;

  switch (cue.name) {
    case "thresholdPause":
      return { ...REST_FRAME, ring: full };
    case "ringSnap":
      return { ...REST_FRAME, ring: { ...landed, snap: true } };
    case "comet": {
      const travelled = hops.slice(0, cue.hop + 1).flat();
      return {
        ...REST_FRAME,
        phases: phasesFor(travelled, "progress"),
        comets: cometsAlong(travelled, MOTION_MS.comet),
        ring: landed,
      };
    }
    case "arrive":
      return {
        ...REST_FRAME,
        phases: phasesFor(path, ended),
        ring: landed,
        highlights: Object.fromEntries(targets.map(id => [id, "success"])),
      };
    case "fail":
      return { ...REST_FRAME, phases: phasesFor(path, "failed"), ring: landed, shaking: targets };
    case "retreat": {
      // Back from where the run turned, last hop first; the target keeps shaking meanwhile.
      const travelled = hops.slice(0, failedReach(hops.length));
      const comets = travelled.flatMap((hop, index) =>
        hop.map(id => ({
          edgeId: id,
          ms: MOTION_MS.retreat,
          delayMs: (travelled.length - 1 - index) * MOTION_MS.retreatStagger,
          direction: "back" as const,
        })),
      );
      return { ...REST_FRAME, phases: phasesFor(path, "failed"), comets, ring: landed, shaking: targets };
    }
    case "relax":
      // Named at rest rather than left out, so an intent edge stays drawn while its colour fades.
      return { ...REST_FRAME, phases: phasesFor(path, "rest") };
    default:
      return { ...REST_FRAME, phases: phasesFor(path, ended), ring: landed };
  }
}

/**
 * What the map shows while `playing` is at its cue, on `graph` — the graph of `shown`, the world
 * held while the queue plays.
 */
export function frameOf(playing: PlayingEvent | null, worlds: Worlds): MapFrame {
  if (!playing) return REST_FRAME;
  const { event } = playing;
  switch (event.kind) {
    case "proposed":
      return proposedFrame(playing, worlds.graph);
    case "approved":
      return approvedFrame(event, playing, worlds.shown);
    case "executed":
    case "reverted":
      return runFrame(playing, worlds);
    case "councilChanged":
      return { ...REST_FRAME, highlights: { [GOVERNANCE_ACCOUNT_NODE_ID]: "success" } };
  }
}

// A failed run's world changes once its comet is back, not at the turn.
const OUTCOME_CUES: ReadonlyArray<Cue["name"]> = ["arrive", "hold", "relax"];

/**
 * The treasury figures to show: the shown world's, except once a run has landed — as its target
 * flashes, or once a failed run's comet is back — when they are those of the read the run arrived in,
 * so they count to their new values as part of the run rather than after it has relaxed. Never the
 * latest read's: it can be newer than events still waiting, and the figures would count back when
 * the next one starts.
 */
export function treasuryShown(playing: PlayingEvent | null, shown: GovernanceSnapshot | null): TreasuryFigures | null {
  return landedWorld(playing, shown)?.treasury ?? null;
}

/** The vault's and the token's states to show: like the figures, they change when a run lands. */
export function nodeStatesShown(playing: PlayingEvent | null, shown: GovernanceSnapshot | null): NodeStates | null {
  return landedWorld(playing, shown)?.nodeStates ?? null;
}

function landedWorld(playing: PlayingEvent | null, shown: GovernanceSnapshot | null): GovernanceSnapshot | null {
  const reachedTarget =
    playing !== null &&
    (playing.event.kind === "executed" || playing.event.kind === "reverted") &&
    OUTCOME_CUES.includes(playing.cue.name);
  return reachedTarget ? playing.world : shown;
}
