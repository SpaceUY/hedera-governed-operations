import { STAGE_TONE_CLASSES } from "./StageDots";
import { type ProposalFamily, STAGE_TITLES, stageLines } from "./copy";
import { PROPOSAL_STAGES, stageTonesOf } from "./proposalProgress";
import type { Proposal } from "@sh/core/governance/proposals";

export type ProposalStagesProps = {
  proposal: Pick<Proposal, "state" | "execution" | "progress" | "incomingProgress">;
  family: ProposalFamily;
  /** The council's rule, "2-of-3". */
  rule: string;
};

/** Create → Sign → Executed, each under a bar in its stage's colour, with a line on what it took. */
export const ProposalStages = ({ proposal, family, rule }: ProposalStagesProps) => {
  const tones = stageTonesOf(proposal);
  const lines = stageLines(proposal, family, rule);
  return (
    <ol className="m-0 grid list-none grid-cols-3 gap-3 p-0">
      {PROPOSAL_STAGES.map(stage => (
        <li key={stage} className="flex flex-col gap-1">
          <span aria-hidden="true" className={`h-0.5 rounded-full ${STAGE_TONE_CLASSES[tones[stage]]}`} />
          <span className="text-xs font-semibold">{STAGE_TITLES[stage]}</span>
          <span className="text-xs text-base-content/70">{lines[stage]}</span>
        </li>
      ))}
    </ol>
  );
};
