/**
 * The agent's decision log: one HCS message per decision the co-signing agent makes, so that what a
 * machine holding a council seat did — and why — is a public record rather than a container log
 * somebody has to be trusted about.
 *
 * The agent holds one of the n keys, so every signature it sends is half a threshold delivered on a
 * policy nobody watched it apply. A decision published here carries the proposal, the outcome, the
 * reason the policy gave and whether a human released it, timestamped by consensus. Anyone can read
 * the topic and check that the signatures on a schedule line up with the decisions that claimed them.
 *
 * **The submit key belongs to the agent, and that is what makes the log evidence.** A topic created
 * without one accepts a message from any account, so "the agent approved X" read off an open topic
 * says only that somebody wrote those words. It is the same property the release topic needs: see
 * `assertTopicIsSigned`.
 */
import { assertTopicIsSigned, fetchDecodedTopicMessagePages } from "../mirror";
import type { MirrorRequestOptions, MirrorTopic } from "../mirror";
import type { ProposalKind } from "./proposalTypes";
import { PublicKey } from "@hiero-ledger/sdk";

/** Carried in every message so the topic can gain another kind of record without breaking readers. */
export const AGENT_DECISION_SCHEMA = "governed-operations/agent-decision/1";

/**
 * The outcomes worth a message. A skip — a proposal already settled, or already carrying this
 * agent's signature — is the steady state of a healthy inbox and says nothing about the policy, so
 * it is not one of them and the type is what says so.
 */
export type PublishedOutcome = "approved" | "refused" | "pending";

const PUBLISHED_OUTCOMES: readonly PublishedOutcome[] = ["approved", "refused", "pending"];

/**
 * How far back the agent reads its own log at boot, in pages of 100. One message per changed verdict
 * keeps a topic small, but a bound has to exist; past it, a verdict older than the window is published
 * once more rather than never.
 */
export const DECISION_LOG_MAX_PAGES = 10;

export type AgentDecision = {
  /** The proposal, by the id the council knows it as. */
  scheduleId: string;
  outcome: PublishedOutcome;
  /**
   * Why, in a sentence: the limit that refused it, the release that matched, or what it is waiting
   * for. This is the whole audit value of a refusal.
   */
  reason: string;
  /** Null when the proposal never got far enough to be read as one of the kinds. */
  kind: ProposalKind | null;
  /** What the proposal asks for, as the domain describes it. */
  proposal: string;
  /** True when a human released this decision with a confirmation code. */
  confirmed: boolean;
  /** The account whose seat decided, so a reader can tell two agents on one council apart. */
  agentAccountId: string;
  /** The agent's own clock. Consensus timestamps the message anyway; the two disagreeing is a fact. */
  decidedAt: string;
};

/** The message a decision publishes. `parseDecisionMessage` reads it back. */
export function buildDecisionMessage(decision: AgentDecision): string {
  return JSON.stringify({ schema: AGENT_DECISION_SCHEMA, ...decision });
}

const STRING_FIELDS = ["scheduleId", "reason", "agentAccountId", "decidedAt"] as const;

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

/**
 * A decision as the topic carries it, or null for anything else on the topic. The agent is the first
 * reader: at boot it reads its own log so a restart does not pay to publish again what is already
 * there.
 */
export function parseDecisionMessage(payload: unknown): AgentDecision | null {
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as Record<string, unknown>;
  if (record.schema !== AGENT_DECISION_SCHEMA) return null;
  if (!STRING_FIELDS.every(field => isNonEmptyString(record[field]))) return null;
  if (!PUBLISHED_OUTCOMES.includes(record.outcome as PublishedOutcome)) return null;
  if (typeof record.confirmed !== "boolean" || typeof record.proposal !== "string") return null;
  if (record.kind !== null && typeof record.kind !== "string") return null;

  return {
    scheduleId: record.scheduleId as string,
    outcome: record.outcome as PublishedOutcome,
    reason: record.reason as string,
    kind: record.kind as ProposalKind | null,
    proposal: record.proposal,
    confirmed: record.confirmed,
    agentAccountId: record.agentAccountId as string,
    decidedAt: record.decidedAt as string,
  };
}

/**
 * What makes two records the same verdict: the fields a reader of the topic can see. It is computed
 * from the record rather than from the agent's in-memory decision so that a verdict read back off the
 * topic and one about to be published compare equal when they say the same thing.
 */
export function decisionRecordSignature(record: Pick<AgentDecision, "outcome" | "confirmed" | "reason">): string {
  return `${record.outcome}:${record.confirmed}:${record.reason}`;
}

export type DecisionHistory = {
  /** The newest decision per proposal. */
  latest: Map<string, AgentDecision>;
  /** True when the page bound ran out before the topic did, so older verdicts were not read. */
  truncated: boolean;
};

/**
 * The standing verdict per proposal of one seat: its newest message for each schedule. A topic held
 * by a key list can carry more than one agent, so another seat's records are left out.
 */
export async function fetchLatestDecisions(
  topicId: string,
  agentAccountId: string,
  options: MirrorRequestOptions = {},
): Promise<DecisionHistory> {
  const { messages, truncated } = await fetchDecodedTopicMessagePages(topicId, {
    ...options,
    order: "desc",
    maxPages: DECISION_LOG_MAX_PAGES,
  });

  const latest = new Map<string, AgentDecision>();
  for (const message of messages) {
    const decision = parseDecisionMessage(message.json);
    if (!decision || decision.agentAccountId !== agentAccountId || latest.has(decision.scheduleId)) continue;
    latest.set(decision.scheduleId, decision);
  }
  return { latest, truncated };
}

/**
 * The check that runs before the agent starts: a decision log anyone can append to is not a log of
 * this agent's decisions. It refuses to start rather than publishing into a topic where its record
 * would carry no more weight than a stranger's.
 */
async function assertDecisionTopicIsSigned(topicId: string, options: MirrorRequestOptions): Promise<MirrorTopic> {
  return assertTopicIsSigned(topicId, "decision", options);
}

/** How Mirror spells a key it cannot report as a single public key — a key list or a threshold key. */
const PROTOBUF_ENCODED = "ProtobufEncoded";

/**
 * The stronger form of the check, for the service that publishes rather than a reader: the topic
 * refuses everyone but its submit key, **and** that key is this agent's.
 *
 * A topic whose submit key belongs to somebody else takes nothing from this agent — every submission
 * comes back `INVALID_SIGNATURE` — so the agent would run a full loop deciding and signing while its
 * decision log stayed empty. That is knowable at boot from one Mirror read, so it is refused there.
 *
 * A key Mirror reports as `ProtobufEncoded` is a key list, and whether the agent is inside it cannot
 * be answered without decoding a structure this check does not need to understand. A deployment that
 * gives the topic to a list including the agent is legitimate, so that case passes: the assertion
 * refuses only what is certainly wrong.
 */
export async function assertDecisionTopicAcceptsKey(
  topicId: string,
  agentPublicKeyHex: string,
  options: MirrorRequestOptions = {},
): Promise<MirrorTopic> {
  const topic = await assertDecisionTopicIsSigned(topicId, options);
  const submitKey = topic.submit_key;
  if (!submitKey || submitKey._type === PROTOBUF_ENCODED) return topic;

  const owner = PublicKey.fromString(submitKey.key).toStringRaw();
  if (owner.toLowerCase() !== agentPublicKeyHex.toLowerCase()) {
    throw new Error(
      `decision topic ${topicId} only takes messages signed by ${owner}, which is not this agent's key: ` +
        "every decision it published would be refused with INVALID_SIGNATURE",
    );
  }
  return topic;
}
