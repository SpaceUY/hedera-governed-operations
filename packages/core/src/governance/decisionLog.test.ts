import { type AgentDecision, assertDecisionTopicAcceptsKey, buildDecisionMessage } from "./decisionLog";
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

describe("the message a decision publishes", () => {
  it("carries every field of the decision, so the topic answers without the agent's log", () => {
    const published = decision({ outcome: "refused", reason: "0.0.8192684 is not a recipient this agent pays" });

    expect(JSON.parse(buildDecisionMessage(published))).toEqual({
      schema: "governed-operations/agent-decision/1",
      ...published,
    });
  });

  it("keeps a proposal that could not be read as one of the kinds", () => {
    const unreadable = decision({ outcome: "refused", kind: null, reason: "the scheduled body is unreadable" });

    expect(JSON.parse(buildDecisionMessage(unreadable)).kind).toBeNull();
  });
});

describe("the topic the agent publishes to", () => {
  it("refuses a topic anyone can publish to, which is what makes its decisions unsigned claims", async () => {
    mockTopicSubmitKey(null);

    await expect(assertDecisionTopicAcceptsKey(TOPIC, AGENT_PUBLIC_KEY_HEX)).rejects.toThrow(/has no submit key/);
  });

  it("refuses a deleted topic", async () => {
    mockTopicSubmitKey({ _type: "ECDSA_SECP256K1", key: AGENT_PUBLIC_KEY_HEX }, true);

    await expect(assertDecisionTopicAcceptsKey(TOPIC, AGENT_PUBLIC_KEY_HEX)).rejects.toThrow(/is deleted/);
  });

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
