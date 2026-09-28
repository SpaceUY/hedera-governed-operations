/**
 * The agent itself: read the inbox, decide, sign, wait, repeat.
 *
 * It holds one seat on the council's threshold key, so it can never act alone — whatever it signs
 * still needs the rest of the threshold, and that is the point. The agent is an approver with a
 * written policy, not an owner.
 *
 * Decisions go out as one JSON object per line. That is what makes them greppable in `docker logs`,
 * and it is the same object a decision published to a topic would carry.
 */
import { startApprovalServer } from "./approvalServer";
import { type ApprovalStore, createApprovalStore } from "./approvals";
import { type AgentConfig, loadConfig } from "./config";
import { type PublishDecision, decisionSignature, publishDecisions } from "./publish";
import { type Decision, type SignSchedule, type VerifyRelease, reviewInbox } from "./review";
import { Client, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import { fetchCouncilKey, fetchProposerAccountIds } from "@sh/core/governance/council";
import { assertDecisionTopicAcceptsKey, buildDecisionMessage } from "@sh/core/governance/decisionLog";
import { fetchProposalInbox } from "@sh/core/governance/proposals";
import { assertReleaseTopicIsSigned, checkImplementationAgainstManifest } from "@sh/core/governance/releaseManifest";
import { buildScheduleSign } from "@sh/core/governance/schedules";
import type { Server } from "node:http";

type LogFields = Record<string, unknown>;

const log = (event: string, fields: LogFields = {}): void => {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
};

/**
 * A sleep between passes that a signal can cut short.
 *
 * A plain `setTimeout` would hold the process for the rest of the poll interval after SIGTERM, and
 * a container runtime gives it about ten seconds before SIGKILL — so at the default interval the
 * agent would usually be killed rather than closing its client.
 */
function createInterruptibleSleep(): { sleep: (ms: number) => Promise<void>; interrupt: () => void } {
  let wake: (() => void) | null = null;
  return {
    sleep: ms =>
      new Promise(resolve => {
        const finish = (): void => {
          clearTimeout(timer);
          wake = null;
          resolve();
        };
        const timer = setTimeout(finish, ms);
        wake = finish;
      }),
    interrupt: () => wake?.(),
  };
}

function createClient(config: AgentConfig): Client {
  const client = config.network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(config.agentAccountId, config.agentKey);
  return client;
}

/**
 * The agent pays for its own `ScheduleSign`, which puts a second row under its key on the schedule —
 * one for approving and one for paying. Counting members rather than rows is what keeps that from
 * reading as two approvals; see `countThresholdSignatures`.
 */
function createSigner(client: Client): SignSchedule {
  return async scheduleId => {
    const response = await buildScheduleSign(scheduleId).execute(client);
    // `getReceipt` already throws on a status other than SUCCESS; this is the belt for the case
    // where a future SDK hands one back instead, because the contract here is that a signature
    // which did not land must never be reported as one that did.
    const receipt = await response.getReceipt(client);
    if (receipt.status.toString() !== "SUCCESS") throw new Error(`ScheduleSign returned ${receipt.status.toString()}`);
  };
}

/**
 * What the agent has already said about each proposal, so a steady inbox does not reprint the same
 * refusal every few seconds. Keyed by schedule, valued by the decision itself: a proposal whose
 * verdict changes — a policy reload, an entry cancelled underneath it — is reported again.
 */
type Reported = Map<string, string>;

/**
 * Each message costs a fee, which the agent pays out of the same account it signs with. That is why
 * the caller deduplicates rather than publishing the same verdict on every pass: at the default
 * interval an unchanged inbox would otherwise be four messages a minute, for ever.
 */
function createPublisher(client: Client, topicId: string): PublishDecision {
  return async decision => {
    const response = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(buildDecisionMessage(decision))
      .execute(client);
    const receipt = await response.getReceipt(client);
    if (receipt.status.toString() !== "SUCCESS") {
      throw new Error(`TopicMessageSubmit returned ${receipt.status.toString()}`);
    }
  };
}

/**
 * The half of an upgrade policy that needs the network, or null when the policy names no release
 * topic — in which case the allowlist of implementations is the whole guarantee, and `parsePolicy`
 * is what insists an upgrade rule carries one of the two.
 */
async function createReleaseVerifier(config: AgentConfig): Promise<VerifyRelease | null> {
  const topicId = config.policy.upgrade?.manifestTopicId;
  if (!topicId) return null;

  // Before the first upgrade, not at the first one: a topic anyone can submit to makes every
  // manifest on it an unsigned claim, and a check against it would pass for an implementation the
  // attacker published themselves. That is a fact about the configuration, so it belongs with the
  // rest of what the agent refuses to start on.
  await assertReleaseTopicIsSigned(topicId, { network: config.network });

  return implementation => checkImplementationAgainstManifest(implementation, topicId, { network: config.network });
}

/** Everything one pass carries over from the last one, and the collaborators it acts through. */
type Pass = {
  sign: SignSchedule | null;
  verifyRelease: VerifyRelease | null;
  /** Proposals this process signed but Mirror has not caught up with. */
  signedThisRun: Set<string>;
  /** What was already said about each proposal, so a steady inbox is not reprinted every few seconds. */
  reported: Reported;
  approvals: ApprovalStore;
  /** Decisions already on the topic, so the agent pays a fee per decision rather than per pass. */
  published: Reported;
  /** Null in a dry run, which costs nothing and therefore records nothing either. */
  publish: PublishDecision | null;
};

async function runOnce(config: AgentConfig, pass: Pass): Promise<void> {
  const { sign, verifyRelease, signedThisRun, reported, approvals } = pass;
  const lookup = {
    executorContractId: config.executorContractId,
    network: config.network,
    rpcUrl: config.rpcUrl,
  };

  const [council, proposers] = await Promise.all([
    fetchCouncilKey(config.governanceAccountId, config.network),
    fetchProposerAccountIds(lookup),
  ]);

  const inbox = await fetchProposalInbox({
    proposerAccountIds: proposers.accountIds,
    unresolvableProposers: proposers.unresolvable,
    governanceAccountId: config.governanceAccountId,
    council,
    network: config.network,
    registry: { executorContractId: config.executorContractId, rpcUrl: config.rpcUrl },
  });

  const result = await reviewInbox(
    inbox,
    {
      executorContractId: config.executorContractId,
      agentPublicKeyHex: config.agentKey.publicKey.toStringRaw(),
      policy: config.policy,
      signedThisRun,
      confirmed: approvals.confirmed(new Date()),
    },
    sign,
    verifyRelease,
  );

  for (const scheduleId of result.signed) signedThisRun.add(scheduleId);
  // Before logging, so a decision that says it is waiting is one the endpoint will already take a
  // code for.
  for (const decision of result.decisions) {
    if (decision.outcome === "pending") approvals.awaitConfirmation(decision.scheduleId);
  }
  for (const decision of result.decisions) logDecision(decision, sign === null, reported);
  for (const failure of result.failures) log("signature-failed", failure);
  if (result.unreachableProposers.length > 0) {
    log("partial-inbox", { unreachableProposers: result.unreachableProposers });
  }

  if (pass.publish) {
    const failures = await publishDecisions(result.decisions, pass.publish, {
      agentAccountId: config.agentAccountId,
      unsigned: new Set(result.failures.map(failure => failure.scheduleId)),
      published: pass.published,
    });
    for (const failure of failures) log("publish-failed", failure);
  }

  forgetProposalsOutsideInbox(new Set(result.decisions.map(decision => decision.scheduleId)), pass);
}

/**
 * Every memory the agent keeps is about proposals it can still see. A schedule that has left the
 * inbox is settled or expired, and re-reading it from Mirror would answer the same question again —
 * so keeping its entry only grows these collections for the life of a process meant to run for
 * months. It is also what bounds a pending approval: a proposal waiting on a code stops waiting when
 * the schedule it belongs to expires.
 */
function forgetProposalsOutsideInbox(inInbox: ReadonlySet<string>, pass: Pass): void {
  for (const scheduleId of pass.signedThisRun) if (!inInbox.has(scheduleId)) pass.signedThisRun.delete(scheduleId);
  for (const scheduleId of pass.reported.keys()) if (!inInbox.has(scheduleId)) pass.reported.delete(scheduleId);
  for (const scheduleId of pass.published.keys()) if (!inInbox.has(scheduleId)) pass.published.delete(scheduleId);
  pass.approvals.forgetOutside(inInbox);
}

function logDecision(decision: Decision, dryRun: boolean, reported: Reported): void {
  // A skip is the steady state of a healthy inbox and would drown the log at one line per poll.
  if (decision.outcome === "skipped") return;
  const signature = decisionSignature(decision);
  if (reported.get(decision.scheduleId) === signature) return;
  reported.set(decision.scheduleId, signature);
  log("decision", {
    scheduleId: decision.scheduleId,
    outcome: decision.outcome === "approved" && dryRun ? "approved-not-signed" : decision.outcome,
    kind: decision.kind,
    reason: decision.reason,
    proposal: decision.description,
    confirmation: decision.confirmation,
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const client = config.dryRun ? null : createClient(config);
  const sign = client === null ? null : createSigner(client);
  let approvalServer: Server | null = null;

  // Everything below runs with a Hedera client open, and an open client holds the event loop. A boot
  // check that throws would otherwise log its refusal and then leave the process sitting there for
  // ever, which reads as a hang rather than as a service that refused to start.
  try {
    log("started", {
      agent: config.agentAccountId,
      governanceAccount: config.governanceAccountId,
      executor: config.executorContractId,
      network: config.network,
      pollIntervalMs: config.pollIntervalMs,
      dryRun: config.dryRun,
      allows: Object.keys(config.policy),
      releaseTopic: config.policy.upgrade?.manifestTopicId ?? null,
      decisionTopic: config.decisionTopicId,
    });

    // Before the first decision, not at the first one: a topic anyone can submit to would make the
    // agent's own record indistinguishable from a stranger's, and a topic held by another key would
    // refuse every one of them.
    await assertDecisionTopicAcceptsKey(config.decisionTopicId, config.agentKey.publicKey.toStringRaw(), {
      network: config.network,
    });

    const pass: Pass = {
      sign,
      verifyRelease: await createReleaseVerifier(config),
      signedThisRun: new Set<string>(),
      reported: new Map(),
      approvals: createApprovalStore(config.confirmationSecret),
      published: new Map(),
      publish: client === null ? null : createPublisher(client, config.decisionTopicId),
    };

    // Only when a code could actually arrive. A policy that escalates nothing has nothing to
    // confirm, and a port open on a service that will never read from it is surface for no reason.
    approvalServer = config.confirmationSecret ? await startApprovalServer(pass.approvals, config.approval) : null;
    if (approvalServer) log("approvals-listening", { host: config.approval.host, port: config.approval.port });

    let running = true;
    const { sleep, interrupt } = createInterruptibleSleep();
    const stop = (signal: string) => () => {
      log("stopping", { signal });
      running = false;
      interrupt();
    };
    process.on("SIGINT", stop("SIGINT"));
    process.on("SIGTERM", stop("SIGTERM"));

    while (running) {
      try {
        await runOnce(config, pass);
      } catch (error) {
        // One bad pass is not a reason to stop holding the seat: Mirror and the relay are both
        // eventually consistent, and the next poll is the retry.
        log("pass-failed", { error: (error as Error).message });
      }
      if (running) await sleep(config.pollIntervalMs);
    }
  } finally {
    client?.close();
    approvalServer?.close();
  }
}

main().catch((error: Error) => {
  // A configuration error reaches here, and it is the one failure that must not be retried silently.
  log("fatal", { error: error.message });
  process.exitCode = 1;
});
