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
import { type AgentConfig, loadConfig } from "./config";
import { type Decision, type SignSchedule, reviewInbox } from "./review";
import { Client } from "@hiero-ledger/sdk";
import { fetchCouncilKey, fetchProposerAccountIds } from "@sh/core/governance/council";
import { fetchProposalInbox } from "@sh/core/governance/proposals";
import { buildScheduleSign } from "@sh/core/governance/schedules";

type LogFields = Record<string, unknown>;

const log = (event: string, fields: LogFields = {}): void => {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
};

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

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

async function runOnce(
  config: AgentConfig,
  sign: SignSchedule | null,
  signedThisRun: Set<string>,
  reported: Reported,
): Promise<void> {
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
    },
    sign,
  );

  for (const scheduleId of result.signed) signedThisRun.add(scheduleId);
  for (const decision of result.decisions) logDecision(decision, sign === null, reported);
  for (const failure of result.failures) log("signature-failed", failure);
  if (result.unreachableProposers.length > 0) {
    log("partial-inbox", { unreachableProposers: result.unreachableProposers });
  }
}

function logDecision(decision: Decision, dryRun: boolean, reported: Reported): void {
  // A skip is the steady state of a healthy inbox and would drown the log at one line per poll.
  if (decision.outcome === "skipped") return;
  const line = `${decision.outcome}:${decision.reason}`;
  if (reported.get(decision.scheduleId) === line) return;
  reported.set(decision.scheduleId, line);
  log("decision", {
    scheduleId: decision.scheduleId,
    outcome: decision.outcome === "approved" && dryRun ? "approved-not-signed" : decision.outcome,
    kind: decision.kind,
    reason: decision.reason,
    proposal: decision.description,
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const client = config.dryRun ? null : createClient(config);
  const sign = client === null ? null : createSigner(client);

  log("started", {
    agent: config.agentAccountId,
    governanceAccount: config.governanceAccountId,
    executor: config.executorContractId,
    network: config.network,
    pollIntervalMs: config.pollIntervalMs,
    dryRun: config.dryRun,
    allows: Object.keys(config.policy),
  });

  let running = true;
  const stop = (signal: string) => () => {
    log("stopping", { signal });
    running = false;
  };
  process.on("SIGINT", stop("SIGINT"));
  process.on("SIGTERM", stop("SIGTERM"));

  const signedThisRun = new Set<string>();
  const reported: Reported = new Map();

  while (running) {
    try {
      await runOnce(config, sign, signedThisRun, reported);
    } catch (error) {
      // One bad pass is not a reason to stop holding the seat: Mirror and the relay are both
      // eventually consistent, and the next poll is the retry.
      log("pass-failed", { error: (error as Error).message });
    }
    if (running) await delay(config.pollIntervalMs);
  }

  client?.close();
}

main().catch((error: Error) => {
  // A configuration error reaches here, and it is the one failure that must not be retried silently.
  log("fatal", { error: error.message });
  process.exitCode = 1;
});
