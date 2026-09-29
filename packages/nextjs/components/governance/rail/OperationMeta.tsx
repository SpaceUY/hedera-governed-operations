import { StageDots } from "./StageDots";
import { FAMILY_COPY, cardStatusLabel } from "./copy";
import { expiryCountdown } from "./expiryCountdown";
import type { ProposalIdentity } from "./proposalIdentity";
import type { Proposal } from "@sh/core/governance/proposals";

export type OperationMetaProps = { proposal: Proposal; family: ProposalIdentity["family"] };

/**
 * The line under a proposal's title: its family, the three stage dots, how many signatures it still
 * needs or how it ended, and while it is live, the time it has left — urgent in its final hour.
 */
export const OperationMeta = ({ proposal, family }: OperationMetaProps) => {
  const countdown = expiryCountdown(proposal.state.expiresAt, proposal.state.status === "pending");
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-base-content/60">
      {family && (
        <span className={family === "contract" ? "font-semibold text-primary" : "font-semibold"}>
          {FAMILY_COPY[family].card}
        </span>
      )}
      <StageDots proposal={proposal} />
      <span>{cardStatusLabel(proposal)}</span>
      {countdown && (
        <span
          className={
            countdown.urgency === "final-hour"
              ? "badge badge-sm badge-warning font-semibold motion-safe:animate-pulse"
              : "chip"
          }
        >
          {countdown.label}
        </span>
      )}
    </span>
  );
};
