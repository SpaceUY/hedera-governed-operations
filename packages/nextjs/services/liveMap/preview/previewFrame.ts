/**
 * The map while an operation is previewed: its route in the mode's phase (dashed violet, mint, or
 * muted dashes), everything it does not touch dimmed — the council and the treasury always stay lit,
 * since they are who decides — the "would …" words on the nodes it changes, and the ring with the
 * selected proposal's approvals. The movement is CSS; this only says what is shown.
 */
import type { PreviewContext } from "./kinds/previewKind";
import { previewLabelsOf } from "./kinds/registry";
import type { MapPreview, PreviewMode } from "./previewSource";
import type { CouncilKey } from "@sh/core/governance/council";
import { isContractProposalKind } from "@sh/core/governance/proposalTypes";
import type { GovernanceSnapshot } from "~~/services/liveMap/events/mapEvents";
import {
  type EdgePhase,
  GOVERNANCE_ACCOUNT_NODE_ID,
  type GovernanceGraph,
  nodeIdOfRef,
  roleNodesOf,
  scopeOf,
} from "~~/services/liveMap/model/graph";
import {
  type MapFrame,
  type PlayingEvent,
  REST_FRAME,
  frameOf,
  proposerArc,
  targetsOf,
} from "~~/services/liveMap/motion/frame";

export type PreviewWorld = { graph: GovernanceGraph; world: GovernanceSnapshot; context: PreviewContext };

const PHASE_OF: Record<PreviewMode, EdgePhase> = { live: "preview", history: "complete", void: "void" };

const unique = (ids: readonly string[]): string[] => [...new Set(ids)];

/**
 * The seats and their lines into the treasury: they decide every operation, so they are never dimmed.
 * Only the council as the ledger has it: a seat another pending rotation would add decides nothing yet.
 */
function councilOf(graph: GovernanceGraph, council: CouncilKey) {
  const seats = new Set(
    graph.nodes.filter(node => node.role === "member" && council.memberKeys.includes(node.ref)).map(node => node.id),
  );
  const lines = graph.edges.filter(edge => edge.to === GOVERNANCE_ACCOUNT_NODE_ID && seats.has(edge.from));
  return { nodeIds: [GOVERNANCE_ACCOUNT_NODE_ID, ...seats], edgeIds: lines.map(edge => edge.id) };
}

type NodeWords = { id: string; text: string };

/** The words on each node: by the entity an operation names, or by the role a sketch's words belong to. */
function wordsOf(graph: GovernanceGraph, { operation }: MapPreview, context: PreviewContext): NodeWords[] {
  if (operation.kind === "sketch") {
    const roles = roleNodesOf(graph, operation);
    return operation.words.flatMap(({ role, text }) => (roles[role] ?? []).map(id => ({ id, text })));
  }
  return previewLabelsOf(operation, context).flatMap(({ ref, text }) => {
    const id = nodeIdOfRef(graph, ref);
    return id ? [{ id, text }] : [];
  });
}

function labelsOn(graph: GovernanceGraph, nodeIds: readonly string[], preview: MapPreview, context: PreviewContext) {
  const labels: Partial<Record<string, string>> = {};
  for (const { id, text } of wordsOf(graph, preview, context)) {
    if (nodeIds.includes(id)) labels[id] = text;
  }
  return labels;
}

const kindOf = ({ operation }: MapPreview) => (operation.kind === "sketch" ? operation.of : operation.kind);

/** A void proposal's round ended without running, so its ring is empty like its muted path. */
function ringOf({ mode, progress }: MapPreview, council: CouncilKey): MapFrame["ring"] {
  if (!progress || mode === "void") return null;
  if (mode === "history") return { signed: council.threshold, snap: false, tone: "success" };
  return { signed: progress.signed, snap: false, tone: null, need: progress.remaining };
}

export function previewFrameOf(preview: MapPreview | null, { graph, world, context }: PreviewWorld): MapFrame {
  if (!preview) return REST_FRAME;
  const scope = scopeOf(graph, preview.operation);
  if (!scope) return REST_FRAME;

  const council = councilOf(graph, world.council);
  const arcId =
    isContractProposalKind(kindOf(preview)) && preview.proposerAccountId
      ? proposerArc(graph, world, preview.proposerAccountId)
      : undefined;
  const arc = graph.edges.find(edge => edge.id === arcId);
  const nodeIds = unique([...scope.nodeIds, ...council.nodeIds, ...(arc ? [arc.from, arc.to] : [])]);
  const edgeIds = unique([...scope.edgeIds, ...council.edgeIds, ...(arc ? [arc.id] : [])]);
  const phase = PHASE_OF[preview.mode];

  return {
    ...REST_FRAME,
    phases: Object.fromEntries(scope.edgeIds.map(id => [id, phase])),
    scope: { nodeIds, edgeIds },
    labels: preview.mode === "live" ? labelsOn(graph, nodeIds, preview, context) : {},
    highlights:
      preview.mode === "history" ? Object.fromEntries(targetsOf(graph, scope.hops).map(id => [id, "success"])) : {},
    ring: ringOf(preview, world.council),
    drawKey: preview.mode === "live" ? preview.key : null,
  };
}

/**
 * One layer at a time: a sequence the ledger started plays on its own, and the preview comes back
 * when it has played, so a selection never cuts into a run.
 */
export function paneFrameOf(playing: PlayingEvent | null, preview: MapPreview | null, worlds: PreviewWorld): MapFrame {
  if (playing) return frameOf(playing, { graph: worlds.graph, shown: worlds.world });
  return previewFrameOf(preview, worlds);
}
