/**
 * The council's inbox. A proposal is a schedule the governance account pays for, and Mirror can only
 * be asked for the schedules an account *created*, never the ones it pays for, so the list is the
 * union of what every proposer created, narrowed to the ones the governance account pays for.
 *
 * That leaves a documented blind spot: a native proposal needs no `PROPOSER_ROLE`, so a schedule
 * opened by an account outside the role does not show up here. It is not a security hole — without
 * the threshold it cannot run — and the search by schedule id covers inspecting one directly.
 */
import { type CouncilKey, type ThresholdProgress, countThresholdSignatures } from "./council";
import {
  type MirrorSchedule,
  type ScheduleState,
  deriveScheduleState,
  fetchSchedulesByCreator,
} from "~~/services/mirror";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

/**
 * How far back the inbox reads per proposer. The list is the recent state of governance, not an
 * archive; anything older is reachable by its schedule id.
 */
export const PROPOSALS_PER_PROPOSER = 25;

export type Proposal = {
  schedule: MirrorSchedule;
  /**
   * Status of the approval round: pending, executed, deleted or expired. It does not know whether
   * the registry entry behind the proposal was cancelled on its own, which would leave a schedule
   * that still looks open; telling those apart needs the proposal id out of the scheduled body.
   */
  state: ScheduleState;
  progress: ThresholdProgress;
};

export type ProposalInbox = {
  /** Newest first. */
  proposals: Proposal[];
  /**
   * Proposers Mirror could not be read for, so their proposals are missing from the list. One
   * unreachable proposer returns a partial inbox rather than no inbox at all.
   */
  unreachableProposers: string[];
};

export type ProposalInboxOptions = {
  /** Whose schedules to read, from `fetchProposerAccountIds`. */
  proposerAccountIds: string[];
  /** Payer of a proposal, and the only thing that separates one from any other schedule a proposer opened. */
  governanceAccountId: string;
  council: CouncilKey;
  network: HederaNetworkName;
};

/** Seconds and nanoseconds, so comparing them as numbers orders them. */
const newestFirst = (left: MirrorSchedule, right: MirrorSchedule): number =>
  Number(right.consensus_timestamp) - Number(left.consensus_timestamp);

export async function fetchProposalInbox({
  proposerAccountIds,
  governanceAccountId,
  council,
  network,
}: ProposalInboxOptions): Promise<ProposalInbox> {
  const readings = await Promise.allSettled(
    proposerAccountIds.map(accountId =>
      fetchSchedulesByCreator(accountId, { network, limit: PROPOSALS_PER_PROPOSER, order: "desc", maxPages: 1 }),
    ),
  );

  // A schedule has one creator, so the same id can only repeat when a proposer is listed twice.
  const byScheduleId = new Map<string, MirrorSchedule>();
  for (const reading of readings) {
    if (reading.status === "rejected") continue;
    for (const schedule of reading.value) {
      if (schedule.payer_account_id === governanceAccountId) byScheduleId.set(schedule.schedule_id, schedule);
    }
  }

  return {
    proposals: [...byScheduleId.values()].sort(newestFirst).map(schedule => ({
      schedule,
      state: deriveScheduleState(schedule),
      progress: countThresholdSignatures(schedule, council),
    })),
    unreachableProposers: proposerAccountIds.filter((_unused, index) => readings[index].status === "rejected"),
  };
}
