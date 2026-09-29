/**
 * Where a proposal stands on its way from created to executed, as the rail draws it: the three dots on
 * a card and the three steps of the detail (Create → Sign → Executed), and how many signatures it
 * still needs. Pure, so the rules are tested without rendering.
 */
import type { ThresholdProgress } from "@sh/core/governance/council";
import type { Proposal } from "@sh/core/governance/proposals";

export type ProposalStage = "create" | "sign" | "executed";

/** `active`: the stage the proposal is in now; `failed`: it ran and reverted. */
export type StageTone = "done" | "active" | "failed" | "idle";

export const PROPOSAL_STAGES: readonly ProposalStage[] = ["create", "sign", "executed"];

type ProgressFacts = Pick<Proposal, "state" | "execution" | "progress" | "incomingProgress">;

const missing = ({ signed, threshold }: ThresholdProgress): number => Math.max(0, threshold - signed);

/**
 * Signatures still needed before the network runs it. A council rotation waits for the current
 * council's threshold and the incoming council's own, so both counts add up.
 */
export function remainingSignatures({
  progress,
  incomingProgress,
}: Pick<ProgressFacts, "progress" | "incomingProgress">) {
  return missing(progress) + (incomingProgress ? missing(incomingProgress) : 0);
}

function executedTone({ state, execution }: ProgressFacts): StageTone {
  if (state.status !== "executed") return "idle";
  if (execution.status === "succeeded") return "done";
  if (execution.status === "failed") return "failed";
  return "active";
}

/** Creating is always done; signing is under way while the schedule is live; running is the network's. */
export function stageTonesOf(facts: ProgressFacts): Record<ProposalStage, StageTone> {
  const { status } = facts.state;
  return {
    create: "done",
    sign: status === "executed" ? "done" : status === "pending" ? "active" : "idle",
    executed: executedTone(facts),
  };
}
