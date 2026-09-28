import {
  type AgentDecision,
  assertDecisionTopicAcceptsKey,
  assertDecisionTopicIsSigned,
  buildDecisionMessage,
  parseDecision,
} from "./decisionLog";
import { PrivateKey } from "@hiero-ledger/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

const TOPIC = "0.0.4242";

const AGENT_KEY = PrivateKey.generateECDSA();
const AGENT_PUBLIC_KEY_HEX = AGENT_KEY.publicKey.toStringRaw();

function decision(overrides: Partial<AgentDecision> = {}): AgentDecision {
  return {
    scheduleId: "0.0.9001",
    outcome: "approved",
    reason: "within policy",
    kind: "treasuryTransfer",
    proposal: "Transfer 0.05 ℏ to 0.0.10671142 out of 0.0.10671146",
    confirmed: false,
    agentAccountId: "0.0.10671144",
    decidedAt: "2026-09-28T10:00:00.000Z",
    ...overrides,
  };
}

function mockTopicSubmitKey(submitKey: { _type: string; key: string } | null, deleted = false): void {
  const topic = { topic_id: TOPIC, memo: "decisions", deleted, submit_key: submitKey, admin_key: null };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(topic))));
}

afterEach(() => vi.unstubAllGlobals());

describe("a published decision", () => {
  it("round-trips through the message the agent submits", () => {
    const published = decision({ outcome: "refused", reason: "0.0.8192684 is not a recipient this agent pays" });

    expect(parseDecision(JSON.parse(buildDecisionMessage(published)))).toEqual(published);
  });

  it("carries the schema, so the topic can hold another kind of record later", () => {
    const message = JSON.parse(buildDecisionMessage(decision())) as Record<string, unknown>;

    expect(message.schema).toBe("governed-operations/agent-decision/1");
  });

  it("keeps a proposal that could not be read as one of the kinds", () => {
    const unreadable = decision({ outcome: "refused", kind: null, reason: "the scheduled body is unreadable" });

    expect(parseDecision(JSON.parse(buildDecisionMessage(unreadable)))?.kind).toBeNull();
  });
});

describe("reading a message off the topic", () => {
  it("is not a decision without the schema, whatever else it carries", () => {
    const message = { ...decision(), schema: "governed-operations/release-manifest/1" };

    expect(parseDecision(message)).toBeNull();
  });

  it("is not a decision on an outcome outside the three worth publishing", () => {
    const message = { ...decision(), outcome: "skipped", schema: "governed-operations/agent-decision/1" };

    expect(parseDecision(message)).toBeNull();
  });

  it("is not a decision when the human confirmation is missing, since that is the claim being made", () => {
    const message: Record<string, unknown> = { ...decision(), schema: "governed-operations/agent-decision/1" };
    delete message.confirmed;

    expect(parseDecision(message)).toBeNull();
  });

  it("is not a decision when the payload is not an object at all", () => {
    expect(parseDecision("approved")).toBeNull();
  });
});

describe("the topic the agent publishes to", () => {
  it("passes a topic only its submit key can write to", async () => {
    mockTopicSubmitKey({ _type: "ED25519", key: "302a300506032b6570032100aa" });

    await expect(assertDecisionTopicIsSigned(TOPIC)).resolves.toMatchObject({ topic_id: TOPIC });
  });

  it("refuses a topic anyone can publish to, which is what makes its decisions unsigned claims", async () => {
    mockTopicSubmitKey(null);

    await expect(assertDecisionTopicIsSigned(TOPIC)).rejects.toThrow(/has no submit key/);
  });

  it("refuses a deleted topic", async () => {
    mockTopicSubmitKey({ _type: "ED25519", key: "302a300506032b6570032100aa" }, true);

    await expect(assertDecisionTopicIsSigned(TOPIC)).rejects.toThrow(/is deleted/);
  });
});

describe("the topic's submit key against the agent's own", () => {
  it("passes when the topic takes messages from this agent", async () => {
    mockTopicSubmitKey({ _type: "ECDSA_SECP256K1", key: AGENT_PUBLIC_KEY_HEX });

    await expect(assertDecisionTopicAcceptsKey(TOPIC, AGENT_PUBLIC_KEY_HEX)).resolves.toMatchObject({
      topic_id: TOPIC,
    });
  });

  it("refuses a topic held by another key, whose every submission would be INVALID_SIGNATURE", async () => {
    mockTopicSubmitKey({ _type: "ECDSA_SECP256K1", key: PrivateKey.generateECDSA().publicKey.toStringRaw() });

    await expect(assertDecisionTopicAcceptsKey(TOPIC, AGENT_PUBLIC_KEY_HEX)).rejects.toThrow(/not this agent's key/);
  });

  it("passes a key list, since the agent may legitimately be one of its members", async () => {
    mockTopicSubmitKey({ _type: "ProtobufEncoded", key: "32240a221220aa" });

    await expect(assertDecisionTopicAcceptsKey(TOPIC, AGENT_PUBLIC_KEY_HEX)).resolves.toMatchObject({
      topic_id: TOPIC,
    });
  });
});
