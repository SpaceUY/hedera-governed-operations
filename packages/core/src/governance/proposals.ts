/**
 * The council's inbox. A proposal is a schedule the governance account pays for, and Mirror can only
 * be asked for the schedules an account *created*, never the ones it pays for, so the list is the
 * union of what every proposer created, narrowed to the ones the governance account pays for.
 *
 * That leaves a documented blind spot: a native proposal needs no `PROPOSER_ROLE`, so a schedule
 * opened by an account outside the role does not show up here. It is not a security hole — without
 * the threshold it cannot run — and the search by schedule id covers inspecting one directly.
 *
 * Each row carries what its scheduled body actually does, and for the ones that go through the
 * registry, the state of the entry behind it. Those two can disagree, and where they do the row is
 * dead: see `registry.ts`.
 */
import { type MirrorSchedule, type ScheduleState, deriveScheduleState, fetchSchedulesByCreator } from "../mirror";
import type { HederaNetworkName } from "../network";
import { type CouncilKey, type ThresholdProgress, countThresholdSignatures } from "./council";
import { decodeScheduledOperation } from "./decode";
import type { ScheduledOperation } from "./proposalTypes";
import { type RegistryCrossCheck, type RegistryLookup, fetchRegistryEntries } from "./registry";
import { ContractId } from "@hiero-ledger/sdk";

/**
 * How far back the inbox reads per proposer. The list is the recent state of governance, not an
 * archive; anything older is reachable by its schedule id.
 */
export const PROPOSALS_PER_PROPOSER = 25;

export type Proposal = {
  schedule: MirrorSchedule;
  /** Status of the approval round: pending, executed, deleted or expired. */
  state: ScheduleState;
  /** How far the current council is from its threshold. */
  progress: ThresholdProgress;
  /**
   * The same count against the council a rotation proposes, and null for every other kind.
   *
   * Verified on testnet: a scheduled key change needs the incoming key's own threshold as well as
   * the outgoing one's, and the schedule waits until it has both. Showing only `progress` for a
   * rotation would leave a bar stuck at its threshold while the proposal sits there, with nothing
   * on screen explaining what it is still waiting for.
   */
  incomingProgress: ThresholdProgress | null;
  /** What the scheduled body does, decoded without the network. */
  operation: ScheduledOperation;
  /**
   * The registry entry behind a contract-backed proposal. It is only read for the ones still
   * pending: an executed schedule implies the entry ran, and a deleted or expired one closed the
   * round anyway. `notApplicable` for the native kinds, which have no entry at all.
   */
  registry: RegistryCrossCheck;
};

export type ProposalInbox = {
  /** Newest first. */
  proposals: Proposal[];
  /**
   * Proposers whose proposals are missing from the list, either because Mirror could not be read for
   * them or because their address resolved to no account. One unreachable proposer returns a partial
   * inbox rather than no inbox at all.
   */
  unreachableProposers: string[];
};

export type ProposalInboxOptions = {
  /** Whose schedules to read, from `fetchProposerAccountIds`. */
  proposerAccountIds: string[];
  /** Role holders that never became account ids, reported as part of the same partial answer. */
  unresolvableProposers?: string[];
  /** Payer of a proposal, and the only thing that separates one from any other schedule a proposer opened. */
  governanceAccountId: string;
  council: CouncilKey;
  network: HederaNetworkName;
  /** The registry the contract-backed proposals are crossed against. */
  registry: RegistryLookup;
};

/** Seconds and nanoseconds, so comparing them as numbers orders them. */
const newestFirst = (left: MirrorSchedule, right: MirrorSchedule): number =>
  Number(right.consensus_timestamp) - Number(left.consensus_timestamp);

type UncrossedProposal = Omit<Proposal, "registry">;

/**
 * A scheduled call can name its contract by id or by EVM address, and both mean the same contract,
 * so comparing the text alone would quietly skip the cross-check on half the proposals.
 */
function isThisExecutor(named: string, executorContractId: string): boolean {
  if (named === executorContractId) return true;
  return named.toLowerCase() === `0x${ContractId.fromString(executorContractId).toEvmAddress()}`.toLowerCase();
}

/**
 * The entry a row has to be crossed against, or null when there is nothing to cross: the round is
 * already over, the proposal is native, or its body names some other contract — in which case an id
 * from it would point at an unrelated entry of ours.
 */
function registryIdOf(proposal: UncrossedProposal, executorContractId: string): number | null {
  if (proposal.state.isSettled) return null;
  if (proposal.operation.kind !== "registryCall") return null;
  if (!isThisExecutor(proposal.operation.executorContractId, executorContractId)) return null;
  return proposal.operation.proposalId;
}

export async function fetchProposalInbox({
  proposerAccountIds,
  unresolvableProposers = [],
  governanceAccountId,
  council,
  network,
  registry,
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

  const uncrossed: UncrossedProposal[] = [...byScheduleId.values()].sort(newestFirst).map(schedule => {
    const operation = decodeScheduledOperation(schedule.transaction_body);
    return {
      schedule,
      state: deriveScheduleState(schedule),
      progress: countThresholdSignatures(schedule, council),
      incomingProgress:
        operation.kind === "councilRotation" ? countThresholdSignatures(schedule, operation.council) : null,
      operation,
    };
  });

  const pendingIds = uncrossed
    .map(proposal => registryIdOf(proposal, registry.executorContractId))
    .filter((id): id is number => id !== null);

  const entries =
    pendingIds.length > 0 ? await fetchRegistryEntries(pendingIds, registry) : new Map<number, RegistryCrossCheck>();

  return {
    proposals: uncrossed.map(proposal => {
      const proposalId = registryIdOf(proposal, registry.executorContractId);
      const crossCheck = proposalId === null ? undefined : entries.get(proposalId);
      return { ...proposal, registry: crossCheck ?? { status: "notApplicable" } };
    }),
    unreachableProposers: [
      ...proposerAccountIds.filter((_unused, index) => readings[index].status === "rejected"),
      ...unresolvableProposers,
    ],
  };
}
