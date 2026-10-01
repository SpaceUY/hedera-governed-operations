import type { Proposal } from "@sh/core/governance/proposals";
import type { GovernanceSnapshot } from "~~/services/liveMap/events/mapEvents";

/** A proposal as one read of the world has it, by schedule id. */
export function proposalIn(world: GovernanceSnapshot | null, scheduleId: string | null): Proposal | undefined {
  return world?.proposals.find(({ schedule }) => schedule.schedule_id === scheduleId);
}

/** What the map is playing, as the rail needs it: which proposals, and the world the map draws meanwhile. */
export type MapPlayback = { busy: readonly string[]; shown: GovernanceSnapshot | null };

/**
 * The proposal as the rail should show it: the copy in the world the map draws while the map still
 * plays it, so its card and detail never announce a result the map has not drawn yet; the live one
 * otherwise, including a proposal that world never had.
 */
export function proposalShown(live: Proposal, { busy, shown }: MapPlayback): Proposal {
  const scheduleId = live.schedule.schedule_id;
  if (!busy.includes(scheduleId)) return live;
  return proposalIn(shown, scheduleId) ?? live;
}

export function proposalsShown(live: readonly Proposal[], playback: MapPlayback): Proposal[] {
  return live.map(proposal => proposalShown(proposal, playback));
}
