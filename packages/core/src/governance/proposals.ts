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
import {
  type MirrorSchedule,
  type ScheduleExecution,
  type ScheduleState,
  deriveScheduleState,
  fetchScheduleExecution,
  fetchSchedulesByCreator,
} from "../mirror";
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
  /**
   * Whether an executed schedule's transaction succeeded or failed, since "executed" only means the
   * network ran it. `notRun` for every other status; `unconfirmed` until Mirror has the outcome.
   */
  execution: ScheduleExecution;
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
   * The registry entry behind a contract-backed proposal. It is read for every registry call to this
   * executor except one whose schedule ran and did not fail, since that run is what executed the
   * entry. A withdrawn or expired schedule is read too: its round is over but its entry is not, and
   * cancelling it afterwards is the documented way to end a proposal, so only the entry can say
   * "Cancelled". An entry that already read `cancelled` or `executed` is taken from `previous`
   * instead of read again, since neither ever changes. `notRead` for a call whose schedule ran it,
   * `missing` for a call to some other contract, and `notApplicable` for the native kinds, which have
   * no entry at all.
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
  /**
   * The inbox this caller read last. An outcome it already resolved, and a registry entry it already
   * read as cancelled or executed, are reused rather than read again, since neither ever changes;
   * without it every settled proposal costs a read per poll.
   */
  previous?: ProposalInbox;
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
 * The entry a row has to be crossed against, or null when there is nothing to cross: the schedule
 * already ran the entry, the proposal is native, or its body names some other contract — in which
 * case an id from it would point at an unrelated entry of ours.
 */
function registryIdOf(proposal: UncrossedProposal, executorContractId: string): number | null {
  if (!canEntryDifferFromSchedule(proposal)) return null;
  if (proposal.operation.kind !== "registryCall") return null;
  if (!isThisExecutor(proposal.operation.executorContractId, executorContractId)) return null;
  return proposal.operation.proposalId;
}

/**
 * Whether the entry can say something the schedule does not. Only a run that did not fail settles
 * the entry with the schedule. Every other schedule leaves it open: still collecting signatures,
 * reverted (the entry stays pending for another round), or withdrawn or expired — after which the
 * entry is still pending until someone cancels it, and cancelling it is what the inbox has to show.
 */
const canEntryDifferFromSchedule = ({ state, execution }: UncrossedProposal): boolean =>
  state.status !== "executed" || execution.status === "failed";

/**
 * Entries the previous read found cancelled or executed, by proposal id. The contract only moves an
 * entry out of pending, never back, so these answers are final whichever schedule they were read
 * for. A pending entry is not kept: it can still be cancelled or run.
 */
function finalEntriesOf(previous: ProposalInbox | undefined): Map<number, RegistryCrossCheck> {
  const finals = new Map<number, RegistryCrossCheck>();
  for (const { registry } of previous?.proposals ?? []) {
    if (registry.status === "read" && registry.entry.state !== "pending") {
      finals.set(registry.entry.proposalId, registry);
    }
  }
  return finals;
}

/**
 * What a proposal whose entry was not read says about it. A native kind has none; a call to some
 * other contract has none in this registry, which is not the same as having no entry at all; and a
 * call to this executor left unread, because its schedule already ran it, still has one.
 */
export function unreadRegistry(operation: ScheduledOperation, executorContractId: string): RegistryCrossCheck {
  if (operation.kind !== "registryCall") return { status: "notApplicable" };
  if (!isThisExecutor(operation.executorContractId, executorContractId)) {
    return { status: "missing", reason: `the call names ${operation.executorContractId}, not this registry` };
  }
  return { status: "notRead" };
}

/** A known outcome from the previous read, or a fresh read for a schedule whose outcome is still open. */
function executionOf(
  schedule: MirrorSchedule,
  network: HederaNetworkName,
  previous: ProposalInbox | undefined,
): Promise<ScheduleExecution> {
  const known = previous?.proposals.find(proposal => proposal.schedule.schedule_id === schedule.schedule_id)?.execution;
  if (known?.status === "succeeded" || known?.status === "failed") return Promise.resolve(known);
  return fetchScheduleExecution(schedule, { network });
}

export async function fetchProposalInbox({
  proposerAccountIds,
  unresolvableProposers = [],
  governanceAccountId,
  council,
  network,
  registry,
  previous,
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

  const schedules = [...byScheduleId.values()].sort(newestFirst);
  const executions = await Promise.all(schedules.map(schedule => executionOf(schedule, network, previous)));

  const uncrossed: UncrossedProposal[] = schedules.map((schedule, index) => {
    const operation = decodeScheduledOperation(schedule.transaction_body);
    return {
      schedule,
      state: deriveScheduleState(schedule),
      execution: executions[index],
      progress: countThresholdSignatures(schedule, council),
      incomingProgress:
        operation.kind === "councilRotation" ? countThresholdSignatures(schedule, operation.council) : null,
      operation,
    };
  });

  const known = finalEntriesOf(previous);
  const idsToRead = uncrossed
    .map(proposal => registryIdOf(proposal, registry.executorContractId))
    .filter((id): id is number => id !== null && !known.has(id));

  const read =
    idsToRead.length > 0 ? await fetchRegistryEntries(idsToRead, registry) : new Map<number, RegistryCrossCheck>();

  return {
    proposals: uncrossed.map(proposal => {
      const proposalId = registryIdOf(proposal, registry.executorContractId);
      const crossCheck = proposalId === null ? undefined : (known.get(proposalId) ?? read.get(proposalId));
      return { ...proposal, registry: crossCheck ?? unreadRegistry(proposal.operation, registry.executorContractId) };
    }),
    unreachableProposers: [
      ...proposerAccountIds.filter((_unused, index) => readings[index].status === "rejected"),
      ...unresolvableProposers,
    ],
  };
}

/**
 * The inbox split by whether the approval round is still open, in the inbox's order. Read from the
 * schedule's state and nothing else: an executed proposal is settled whatever its outcome.
 */
export function partitionProposals<T extends Pick<Proposal, "state">>(proposals: T[]): { pending: T[]; settled: T[] } {
  return {
    pending: proposals.filter(proposal => proposal.state.status === "pending"),
    settled: proposals.filter(proposal => proposal.state.status !== "pending"),
  };
}
