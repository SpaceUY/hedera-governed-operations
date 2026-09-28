import type { Proposal } from "@sh/core/governance/proposals";
import type { GovernanceSnapshot } from "~~/services/governance/mapEvents";

/** A proposal as one read of the world has it, by schedule id. */
export function proposalIn(world: GovernanceSnapshot | null, scheduleId: string | null): Proposal | undefined {
  return world?.proposals.find(({ schedule }) => schedule.schedule_id === scheduleId);
}
