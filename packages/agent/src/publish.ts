/**
 * What of a pass reaches the audit topic.
 *
 * Deciding and signing already happened by the time anything here runs, and that ordering is the
 * design: publishing is a record of what the agent did, never a step it waits on. A topic the Mirror
 * Node cannot reach, a fee that failed, a submit key rotated underneath the service — none of them
 * may stop a council seat from voting.
 */
import type { Decision } from "./review";
import type { AgentDecision } from "@sh/core/governance/decisionLog";

/**
 * Publishes one decision. Like `SignSchedule` it returns nothing and throws, so a record that did
 * not reach consensus is never remembered as one that did.
 */
export type PublishDecision = (decision: AgentDecision) => Promise<void>;

/** What makes a decision the same decision, for the log and for the topic alike. */
export const decisionSignature = (decision: Decision): string =>
  `${decision.outcome}:${decision.confirmation}:${decision.reason}`;

/** The decision as the topic carries it, or null for a skip, which says nothing about the policy. */
export function recordOf(decision: Decision, agentAccountId: string, decidedAt: Date): AgentDecision | null {
  if (decision.outcome === "skipped") return null;
  return {
    scheduleId: decision.scheduleId,
    outcome: decision.outcome,
    reason: decision.reason,
    kind: decision.kind,
    proposal: decision.description,
    confirmed: decision.confirmation === "received",
    agentAccountId,
    decidedAt: decidedAt.toISOString(),
  };
}

export type PublishOptions = {
  /** The seat that decided, so a reader can tell two agents on one council apart. */
  agentAccountId: string;
  /**
   * Approvals whose `ScheduleSign` failed in this pass. Their record is held back rather than
   * published: "approved" on the topic, next to a schedule that never got the agent's signature, is
   * a record that reads as a lie. The next pass reaches the same decision and publishes it then.
   */
  unsigned: ReadonlySet<string>;
  /**
   * What is already on the topic, by schedule. Updated in place as records land, and **only** as
   * they land: a publish that failed has to be retried, and one that is remembered as done never is.
   *
   * This is what keeps the cost proportional to decisions rather than to passes. Each message is a
   * fee the agent pays out of the account it signs with, and at the default interval an unchanged
   * inbox would otherwise be four messages a minute, for ever.
   */
  published: Map<string, string>;
};

export type PublishFailure = { scheduleId: string; error: string };

/** Publishes what changed in this pass, and answers with what could not be written. */
export async function publishDecisions(
  decisions: readonly Decision[],
  publish: PublishDecision,
  options: PublishOptions,
): Promise<PublishFailure[]> {
  const failures: PublishFailure[] = [];

  // Sequentially, for the reason signatures are: two submissions from the same account race for the
  // same transaction id window.
  for (const decision of decisions) {
    const record = recordOf(decision, options.agentAccountId, new Date());
    if (!record) continue;
    if (record.outcome === "approved" && options.unsigned.has(decision.scheduleId)) continue;

    const signature = decisionSignature(decision);
    if (options.published.get(decision.scheduleId) === signature) continue;

    try {
      await publish(record);
      options.published.set(decision.scheduleId, signature);
    } catch (error) {
      // The decision has already been made and acted on; a record that could not be written is not
      // a reason to stop holding the seat.
      failures.push({ scheduleId: decision.scheduleId, error: (error as Error).message });
    }
  }

  return failures;
}
