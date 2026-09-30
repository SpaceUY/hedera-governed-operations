"use client";

import { useMemo } from "react";
import { useParams, usePathname } from "next/navigation";
import type { CaptionFacts } from "./caption";
import type { Proposal } from "@sh/core/governance/proposals";
import { proposalIdentityOf } from "~~/components/governance/rail/proposalIdentity";
import { remainingSignatures } from "~~/components/governance/rail/proposalProgress";
import { useSelectedSchedule } from "~~/components/governance/rail/useSelectedSchedule";
import { useProposalWizard } from "~~/components/governance/wizard/ProposalWizardProvider";
import { PROPOSAL_KIND_COPY } from "~~/components/governance/wizard/copy";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { useProposalLookup } from "~~/hooks/mirror/useProposalLookup";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import type { DraftPreview } from "~~/services/governance/drafts";
import {
  type MapPreview,
  type PreviewTarget,
  draftPreviewOf,
  previewTargetKey,
  previewTargetOf,
  selectedPreviewOf,
} from "~~/services/liveMap/preview/previewSource";

type Shown = { preview: MapPreview | null; title: string | null };

type ShownSources = { draft: DraftPreview | null; accountId: string | null; proposal: Proposal | undefined };

const NOTHING: Shown = { preview: null, title: null };

/** What the caption says for a target and the preview drawn for it; `title` names the proposal or the draft's kind. */
export function captionFactsOf(target: PreviewTarget, preview: MapPreview | null, title: string | null): CaptionFacts {
  if (target.kind === "draft") return { kind: "drafting", title: preview ? title : null };
  if (!preview || !title) return { kind: "idle" };
  return preview.mode === "live" ? { kind: "previewing", title } : { kind: preview.mode, title };
}

function shownFor(target: PreviewTarget, { draft, accountId, proposal }: ShownSources): Shown {
  if (target.kind === "draft" && draft) {
    return { preview: draftPreviewOf(draft, accountId), title: PROPOSAL_KIND_COPY[draft.kind].title };
  }
  if (target.kind === "schedule" && proposal) {
    return {
      preview: selectedPreviewOf(proposal, remainingSignatures(proposal)),
      title: proposalIdentityOf(proposal).title,
    };
  }
  return NOTHING;
}

/**
 * What the map previews, read from what the rail shows: the wizard's draft on `/governance/new`, the
 * proposal `/governance/[scheduleId]` or `?schedule=` names. The proposal comes from the same lookup
 * the rail's detail reads, so the map adds no polling of its own.
 */
export function useMapPreview(config: GovernanceConfig) {
  const pathname = usePathname();
  const params = useParams<{ scheduleId?: string }>();
  const { selectedScheduleId } = useSelectedSchedule();
  const routeScheduleId = params.scheduleId ?? null;
  const target = useMemo(
    () => previewTargetOf({ pathname, routeScheduleId, selectedScheduleId }),
    [pathname, routeScheduleId, selectedScheduleId],
  );
  const { preview: draft } = useProposalWizard();
  const { accountId } = useHederaSigner();
  const { proposal } = useProposalLookup({
    scheduleId: target.kind === "schedule" ? target.scheduleId : "",
    governanceAccountId: config.governanceAccountId,
    executorContractId: config.executor.hederaContractId,
    network: config.network,
  });

  return useMemo(() => {
    const shown = shownFor(target, { draft, accountId: accountId ?? null, proposal });
    return {
      preview: shown.preview,
      caption: captionFactsOf(target, shown.preview, shown.title),
      targetKey: previewTargetKey(target),
    };
  }, [target, draft, accountId, proposal]);
}
