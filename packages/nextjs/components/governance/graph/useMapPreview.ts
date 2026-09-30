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
import type { WizardKind } from "~~/components/governance/wizard/kinds/wizardKinds";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { useProposalLookup } from "~~/hooks/mirror/useProposalLookup";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { useCoSigningAgent } from "~~/hooks/useCoSigningAgent";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import type { DraftPreview } from "~~/services/governance/drafts";
import { governanceEntitiesOf } from "~~/services/liveMap/model/graphEntities";
import type { SketchContext } from "~~/services/liveMap/preview/kinds/previewKind";
import {
  type MapPreview,
  type PreviewTarget,
  draftPreviewOf,
  previewTargetKey,
  previewTargetOf,
  selectedPreviewOf,
  sketchPreviewOf,
} from "~~/services/liveMap/preview/previewSource";

type Shown = { preview: MapPreview | null; title: string | null };

type ShownSources = {
  draft: DraftPreview | null;
  kind: WizardKind;
  sketch: SketchContext;
  accountId: string | null;
  proposal: Proposal | undefined;
};

const NOTHING: Shown = { preview: null, title: null };

/**
 * What the caption says for a target and the preview drawn for it; `title` names the proposal or the
 * wizard's kind. In the wizard: a draft by its exact words, a picked kind by the way it would go, and
 * a kind the map cannot draw yet by asking for the form. Only with no kind picked does it ask for one.
 */
export function captionFactsOf(target: PreviewTarget, preview: MapPreview | null, title: string | null): CaptionFacts {
  if (target.kind === "draft") {
    if (!title) return { kind: "drafting", title: null };
    if (!preview) return { kind: "picked", title };
    return preview.operation.kind === "sketch" ? { kind: "sketching", title } : { kind: "drafting", title };
  }
  if (!preview || !title) return { kind: "idle" };
  return preview.mode === "live" ? { kind: "previewing", title } : { kind: preview.mode, title };
}

function shownFor(target: PreviewTarget, { draft, kind, sketch, accountId, proposal }: ShownSources): Shown {
  if (target.kind === "draft") {
    // The form's draft once it holds one; until then the picked kind's way, with no amounts.
    const preview = draft ? draftPreviewOf(draft, accountId) : sketchPreviewOf(kind, sketch, accountId);
    return { preview, title: PROPOSAL_KIND_COPY[draft?.kind ?? kind].title };
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
 * What the map previews, read from what the rail shows: the wizard's draft on `/governance/new` — or,
 * until its form holds one, the picked kind's way through the configured contracts — the proposal
 * `/governance/[scheduleId]` or `?schedule=` names. The proposal comes from the same lookup
 * the rail's detail reads, so the map adds no polling of its own. It returns the target and the title
 * too, and leaves the caption to `useLiveMap`: only once the frame is drawn does the pane know which
 * one `captionFactsOf` should say.
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
  const { preview: draft, kind } = useProposalWizard();
  const { accountId } = useHederaSigner();
  const { targetNetwork } = useTargetNetwork();
  const agentSeat = useCoSigningAgent(config.network)?.seat ?? null;
  const sketch = useMemo<SketchContext>(
    () => ({
      governanceAccountId: config.governanceAccountId,
      entities: governanceEntitiesOf(config, targetNetwork.id),
      agentSeat,
    }),
    [config, targetNetwork.id, agentSeat],
  );
  const { proposal } = useProposalLookup({
    scheduleId: target.kind === "schedule" ? target.scheduleId : "",
    governanceAccountId: config.governanceAccountId,
    executorContractId: config.executor.hederaContractId,
    network: config.network,
  });

  return useMemo(() => {
    const shown = shownFor(target, { draft, kind, sketch, accountId: accountId ?? null, proposal });
    return { ...shown, target, targetKey: previewTargetKey(target) };
  }, [target, draft, kind, sketch, accountId, proposal]);
}
