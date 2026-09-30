/**
 * What the map previews, from what the rail shows: the draft on the wizard's route, the proposal a
 * detail route or `?schedule=` names on `/`. A proposal is previewed in one of three modes — `live`
 * while the council could still sign it (dashed violet), `history` once it ran and succeeded (mint),
 * `void` once its round ended without running (muted dashes) — and not at all when its body, or the
 * registry entry it runs, cannot be described: the map never claims to know what it does not.
 */
import type { KnownOperation, PreviewSketch, SketchContext } from "./kinds/previewKind";
import { sketchOf } from "./kinds/registry";
import type { ProposalKind } from "@sh/core/governance/proposalTypes";
import type { Proposal } from "@sh/core/governance/proposals";
import { GOVERNANCE_ROUTES } from "~~/config/governanceConfig";
import type { DraftPreview } from "~~/services/governance/drafts";
import { canShowIntent } from "~~/services/governance/proposalActions";
import { decodedOperationOf } from "~~/services/liveMap/model/proposalRoutes";

export type PreviewTarget = { kind: "none" } | { kind: "draft" } | { kind: "schedule"; scheduleId: string };

type RouteFacts = { pathname: string; routeScheduleId: string | null; selectedScheduleId: string | null };

export function previewTargetOf({ pathname, routeScheduleId, selectedScheduleId }: RouteFacts): PreviewTarget {
  if (pathname === GOVERNANCE_ROUTES.newProposal) return { kind: "draft" };
  if (routeScheduleId) return { kind: "schedule", scheduleId: routeScheduleId };
  if (pathname === GOVERNANCE_ROUTES.home && selectedScheduleId)
    return { kind: "schedule", scheduleId: selectedScheduleId };
  return { kind: "none" };
}

export const previewTargetKey = (target: PreviewTarget): string =>
  target.kind === "schedule" ? `schedule:${target.scheduleId}` : target.kind;

export type PreviewMode = "live" | "history" | "void";

export function previewModeOf(proposal: Proposal): PreviewMode | null {
  if (canShowIntent(proposal)) return "live";
  const { state, execution, registry } = proposal;
  if (state.status === "executed") return execution.status === "succeeded" ? "history" : null;
  if (state.status === "deleted" || state.status === "expired") return "void";
  if (registry.status === "read" && registry.entry.state === "cancelled") return "void";
  return null;
}

export type MapPreview = {
  /** Changes with the selection or the draft's kind, and restarts the dashed drawing when it does. */
  key: string;
  /** What is previewed: a decoded operation, or a kind picked in the wizard whose form holds none yet. */
  operation: KnownOperation | PreviewSketch;
  mode: PreviewMode;
  /** Who registered a contract proposal — its creator, or the connected account for a draft — for its PROPOSER_ROLE arc. */
  proposerAccountId: string | null;
  /** The selected proposal's approvals and what it still needs; null for a draft. */
  progress: { signed: number; remaining: number } | null;
};

/** `remaining` is how many signatures it still needs, both councils counted for a rotation. */
export function selectedPreviewOf(proposal: Proposal, remaining: number): MapPreview | null {
  const mode = previewModeOf(proposal);
  const operation = decodedOperationOf(proposal);
  if (!mode || operation.kind === "unrecognized") return null;
  return {
    key: `schedule:${proposal.schedule.schedule_id}`,
    operation,
    mode,
    proposerAccountId: proposal.schedule.creator_account_id,
    progress: { signed: proposal.progress.signed, remaining },
  };
}

/** A draft is previewed like a live proposal; keyed by its kind, so editing the form does not redraw it. */
export function draftPreviewOf(preview: DraftPreview, proposerAccountId: string | null): MapPreview | null {
  const operation = preview.path === "native" ? preview.scheduled : preview.operation;
  if (operation.kind === "unrecognized" || operation.kind === "registryCall") return null;
  return { key: `draft:${preview.kind}`, operation, mode: "live", proposerAccountId, progress: null };
}

/**
 * A kind picked in the wizard before its form holds an operation: its way through the map, with no
 * amount or recipient. Keyed like the draft it becomes, so filling the form in crossfades the words
 * rather than redrawing the path.
 */
export function sketchPreviewOf(
  kind: ProposalKind,
  context: SketchContext,
  proposerAccountId: string | null,
): MapPreview {
  return { key: `draft:${kind}`, operation: sketchOf(kind, context), mode: "live", proposerAccountId, progress: null };
}
