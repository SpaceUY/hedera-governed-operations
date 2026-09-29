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
import { assertTopicIsSigned } from "../mirror";
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

/**
 * The message a decision publishes.
 *
 * There is deliberately no reader here yet. The topic is public and a reader is a parse away, but
 * nothing in this template reads its own decision log, and a parser with no consumer is a contract
 * nobody is holding to — it belongs in the change that first shows a decision on a screen.
 */
export function buildDecisionMessage(decision: AgentDecision): string {
  return JSON.stringify({ schema: AGENT_DECISION_SCHEMA, ...decision });
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
