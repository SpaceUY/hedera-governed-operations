import { CouncilMemberRow } from "./CouncilMemberRow";
import type { CouncilKey, Proposer, ThresholdProgress } from "@sh/core/governance/council";
import { memberLabel, requiredSignaturesLabel } from "~~/services/governance/proposalLabels";

export type ApproverListProps = {
  heading: string;
  council: CouncilKey;
  progress: ThresholdProgress;
  proposers: readonly Proposer[];
  viewerAccountId: string | null;
  /** One below the panel's title: 2 on the detail route, 3 when the panel opens under a card. */
  headingLevel?: 2 | 3;
};

/**
 * Every seat of one council, one row each, not just the aggregate "n of m" text: who holds the seat
 * (a proposer's account, "You" for the connected one, or the start of the key when nobody proposes
 * it) and whether it has signed. A council rotation renders this twice — see `ProposalDetailPanel` —
 * since the schedule waits for both the current council's threshold and the incoming one's own.
 */
export const ApproverList = ({
  heading,
  council,
  progress,
  proposers,
  viewerAccountId,
  headingLevel = 2,
}: ApproverListProps) => {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section aria-label={heading} className="flex flex-col gap-1">
      <Heading className="m-0 text-sm font-semibold">{heading}</Heading>
      <p className="m-0 text-xs text-base-content/60">{requiredSignaturesLabel(progress)}</p>
      <ul className="m-0 p-0 list-none flex flex-col gap-1">
        {council.memberKeys.map(key => (
          <CouncilMemberRow
            key={key}
            label={memberLabel(key, proposers, viewerAccountId)}
            hasSigned={progress.signedBy.includes(key)}
          />
        ))}
      </ul>
    </section>
  );
};
