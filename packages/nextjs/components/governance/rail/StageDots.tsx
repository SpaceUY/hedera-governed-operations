import { stagesAriaLabel } from "./copy";
import { PROPOSAL_STAGES, type StageTone, stageTonesOf } from "./proposalProgress";
import type { Proposal } from "@sh/core/governance/proposals";

/** The colour of a stage, shared by a card's dots and the detail's steps. */
export const STAGE_TONE_CLASSES: Record<StageTone, string> = {
  done: "bg-success",
  active: "bg-primary",
  failed: "bg-error",
  idle: "bg-base-content/20",
};

/** Create · Sign · Executed as three dots, read out as a sentence. */
export const StageDots = ({
  proposal,
}: {
  proposal: Pick<Proposal, "state" | "execution" | "progress" | "incomingProgress">;
}) => {
  const tones = stageTonesOf(proposal);
  return (
    <span role="img" aria-label={stagesAriaLabel(proposal)} className="inline-flex items-center gap-1">
      {PROPOSAL_STAGES.map(stage => (
        <span key={stage} className={`size-1.5 rounded-full ${STAGE_TONE_CLASSES[tones[stage]]}`} />
      ))}
    </span>
  );
};
