/**
 * One pass over the council's inbox: read each proposal, decide, and sign the ones the policy
 * allows. The deciding is pure and the signing is injected, so the interesting half is testable
 * without a network and without a key.
 *
 * "Refused" and "skipped" are kept apart on purpose. A refusal is the policy saying no and is worth
 * a human's attention; a skip is a proposal that needs nothing — already settled, or already carrying
 * this agent's signature. Collapsing the two would make the agent report a refusal on every poll for
 * a proposal it approved minutes ago.
 */
import { type GovernedOperation, readOperation } from "./operation";
import { type Policy, reviewOperation } from "./policy";
import { isSignedByKey } from "@sh/core/governance/council";
import { describeRegistryOperation, describeScheduledOperation } from "@sh/core/governance/proposalTypes";
import type { Proposal, ProposalInbox } from "@sh/core/governance/proposals";
import type { ManifestCheck } from "@sh/core/governance/releaseManifest";

export type DecisionOutcome = "approved" | "refused" | "skipped";

export type Decision = {
  scheduleId: string;
  outcome: DecisionOutcome;
  /** Why, in a sentence. Every refusal names the limit it failed. */
  reason: string;
  /** What the proposal asks for, as the domain describes it. */
  description: string;
  /** Null when the proposal never got far enough to be read as one of the five kinds. */
  kind: GovernedOperation["kind"] | null;
  /** The operation the decision was made about, for the caller to act on or record. */
  operation: GovernedOperation | null;
};

export type ReviewOptions = {
  executorContractId: string;
  /** Raw hex, matched against the signature prefixes Mirror records on the schedule. */
  agentPublicKeyHex: string;
  policy: Policy;
  /**
   * Schedules this process has already signed, which Mirror may not show yet.
   *
   * Mirror lags consensus by a few seconds and the agent polls faster than that, so the signature it
   * just sent is invisible on the next pass and the schedule still reads as pending and unsigned.
   * Measured against testnet: without this the agent signs the same proposal again and the receipt
   * comes back `SCHEDULE_ALREADY_EXECUTED`, one wasted fee per pass until Mirror catches up — and on
   * a proposal still short of its threshold, a duplicate `ScheduleSign` nobody asked for.
   *
   * It is deliberately only this process's memory. Restarting loses it, by which time Mirror is the
   * better answer anyway.
   */
  signedThisRun: ReadonlySet<string>;
};

/** The registry entry's own words when there is one, since that is the operation for three of the kinds. */
function describe(proposal: Proposal): string {
  const scheduled = describeScheduledOperation(proposal.operation);
  if (proposal.registry.status !== "read") return scheduled;
  return `${scheduled} — ${describeRegistryOperation(proposal.registry.entry.operation)}`;
}

export function decide(proposal: Proposal, options: ReviewOptions): Decision {
  const scheduleId = proposal.schedule.schedule_id;
  const base = { scheduleId, description: describe(proposal) };

  const nothing = { ...base, kind: null, operation: null };

  if (proposal.state.isSettled) {
    return { ...nothing, outcome: "skipped", reason: `already ${proposal.state.status}` };
  }
  if (options.signedThisRun.has(scheduleId)) {
    return { ...nothing, outcome: "skipped", reason: "signed by this agent, not yet on Mirror" };
  }
  if (isSignedByKey(proposal.schedule, options.agentPublicKeyHex)) {
    return { ...nothing, outcome: "skipped", reason: "already signed by this agent" };
  }

  const read = readOperation(proposal, options.executorContractId);
  if (!read.readable) return { ...nothing, outcome: "refused", reason: read.reason };

  const operation = read.operation;
  const verdict = reviewOperation(operation, options.policy);
  return verdict.approved
    ? { ...base, outcome: "approved", reason: "within policy", kind: operation.kind, operation }
    : { ...base, outcome: "refused", reason: verdict.reason, kind: operation.kind, operation };
}

/**
 * The half of an upgrade policy that needs the network: whether the code deployed at the proposed
 * implementation is a build the release topic published. It is separate from `decide` so the policy
 * stays a pure function, and it runs only on an upgrade a policy has already approved.
 */
export type VerifyRelease = (implementation: string) => Promise<ManifestCheck>;

async function verifyUpgrade(decision: Decision, verify: VerifyRelease): Promise<Decision> {
  if (decision.outcome !== "approved" || decision.operation?.kind !== "upgrade") return decision;

  try {
    const check = await verify(decision.operation.implementation);
    if (check.matched) {
      return { ...decision, reason: `within policy, release ${check.manifest.version}` };
    }
    return { ...decision, outcome: "refused", reason: check.reason };
  } catch (error) {
    // A check that could not be run is not a check that passed.
    return {
      ...decision,
      outcome: "refused",
      reason: `the release could not be verified: ${(error as Error).message}`,
    };
  }
}

/**
 * Signs one schedule. It returns nothing on success and throws on failure, which is the whole
 * contract: a signature that did not land must not be reported as one that did.
 */
export type SignSchedule = (scheduleId: string) => Promise<void>;

export type ReviewResult = {
  decisions: Decision[];
  /** Schedules signed in this pass, for the caller to carry into the next one. */
  signed: string[];
  /** Proposers the inbox could not read, passed through so the agent can say its view is partial. */
  unreachableProposers: string[];
  /** Approved proposals whose signature failed, with the error. They are retried on the next pass. */
  failures: { scheduleId: string; error: string }[];
};

export async function reviewInbox(
  inbox: ProposalInbox,
  options: ReviewOptions,
  sign: SignSchedule | null,
  verifyRelease: VerifyRelease | null = null,
): Promise<ReviewResult> {
  const decisions: Decision[] = [];
  const failures: ReviewResult["failures"] = [];
  const signed: string[] = [];

  // Sequentially: two signatures from the same account race for the same transaction id window, and
  // the second proposal is usually the one that would have to be retried anyway.
  for (const proposal of inbox.proposals) {
    const reviewed = decide(proposal, options);
    const decision = verifyRelease ? await verifyUpgrade(reviewed, verifyRelease) : reviewed;
    decisions.push(decision);

    if (decision.outcome !== "approved" || sign === null) continue;
    try {
      await sign(decision.scheduleId);
      signed.push(decision.scheduleId);
    } catch (error) {
      failures.push({ scheduleId: decision.scheduleId, error: (error as Error).message });
    }
  }

  return { decisions, signed, unreachableProposers: inbox.unreachableProposers, failures };
}
