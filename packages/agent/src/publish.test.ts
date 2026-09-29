import { publishDecisions, publishedFromHistory, recordOf } from "./publish";
import type { Decision } from "./review";
import type { AgentDecision } from "@sh/core/governance/decisionLog";
import { describe, expect, it, vi } from "vitest";

const AGENT = "0.0.10671144";
const UPGRADE = "0.0.9001";
const TRANSFER = "0.0.9002";
const DECIDED_AT = new Date("2026-09-28T10:00:00.000Z");

function decision(overrides: Partial<Decision> = {}): Decision {
  return {
    scheduleId: UPGRADE,
    outcome: "approved",
    reason: "within policy",
    description: "Upgrade 0x1234 to 0x5678",
    kind: "upgrade",
    operation: null,
    confirmation: "notRequired",
    ...overrides,
  };
}

const options = (overrides: Partial<Parameters<typeof publishDecisions>[2]> = {}) => ({
  agentAccountId: AGENT,
  unsigned: new Set<string>(),
  published: new Map<string, string>(),
  ...overrides,
});

describe("the record a decision becomes", () => {
  it("carries the seat that decided, since a council can hold more than one agent", () => {
    expect(recordOf(decision(), AGENT, DECIDED_AT)?.agentAccountId).toBe(AGENT);
  });

  it("says a person released it only when one did", () => {
    expect(recordOf(decision({ confirmation: "received" }), AGENT, DECIDED_AT)?.confirmed).toBe(true);
    expect(recordOf(decision(), AGENT, DECIDED_AT)?.confirmed).toBe(false);
    expect(recordOf(decision({ outcome: "pending", confirmation: "required" }), AGENT, DECIDED_AT)?.confirmed).toBe(
      false,
    );
  });

  it("is nothing at all for a skip, which says nothing about the policy", () => {
    expect(recordOf(decision({ outcome: "skipped", reason: "already executed" }), AGENT, DECIDED_AT)).toBeNull();
  });
});

describe("publishing a pass", () => {
  it("writes a decision once, however many passes reach it again", async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const shared = options();

    await publishDecisions([decision()], publish, shared);
    await publishDecisions([decision()], publish, shared);

    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("does not write again what an earlier run already put on the topic", async () => {
    const onTopic = recordOf(decision(), AGENT, DECIDED_AT)!;
    const publish = vi.fn().mockResolvedValue(undefined);

    await publishDecisions(
      [decision()],
      publish,
      options({ published: publishedFromHistory(new Map([[UPGRADE, onTopic]])) }),
    );

    expect(publish).not.toHaveBeenCalled();
  });

  it("writes a verdict that changed since the earlier run, even though the proposal was already on the topic", async () => {
    const onTopic = recordOf(
      decision({ outcome: "pending", reason: "waiting for a confirmation code" }),
      AGENT,
      DECIDED_AT,
    )!;
    const publish = vi.fn().mockResolvedValue(undefined);

    await publishDecisions(
      [decision()],
      publish,
      options({ published: publishedFromHistory(new Map([[UPGRADE, onTopic]])) }),
    );

    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("writes it again once the verdict changes, which is the only thing worth a second fee", async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const shared = options();

    await publishDecisions([decision({ outcome: "pending", confirmation: "required" })], publish, shared);
    await publishDecisions([decision({ confirmation: "received" })], publish, shared);

    expect(publish).toHaveBeenCalledTimes(2);
    expect((publish.mock.calls[1][0] as AgentDecision).confirmed).toBe(true);
  });

  it("skips a proposal the agent had nothing to say about", async () => {
    const publish = vi.fn().mockResolvedValue(undefined);

    await publishDecisions([decision({ outcome: "skipped" })], publish, options());

    expect(publish).not.toHaveBeenCalled();
  });

  it("holds back an approval whose signature failed, since the record would read as a lie", async () => {
    const publish = vi.fn().mockResolvedValue(undefined);

    await publishDecisions([decision()], publish, options({ unsigned: new Set([UPGRADE]) }));

    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes a refusal whatever the signing did, since no signature was involved", async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const refused = decision({ outcome: "refused", reason: "implementation 0x… is not in the allowlist" });

    await publishDecisions([refused], publish, options({ unsigned: new Set([UPGRADE]) }));

    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("answers with what could not be written instead of throwing", async () => {
    const publish = vi.fn().mockRejectedValue(new Error("Mirror 503"));

    const failures = await publishDecisions([decision()], publish, options());

    expect(failures).toEqual([{ scheduleId: UPGRADE, error: "Mirror 503" }]);
  });

  it("retries a record that failed, since nothing is remembered as published until it is", async () => {
    const publish = vi.fn().mockRejectedValueOnce(new Error("Mirror 503")).mockResolvedValueOnce(undefined);
    const shared = options();

    await publishDecisions([decision()], publish, shared);
    const failures = await publishDecisions([decision()], publish, shared);

    expect(publish).toHaveBeenCalledTimes(2);
    expect(failures).toEqual([]);
  });

  it("carries on to the rest of the pass after one record fails", async () => {
    const publish = vi.fn().mockRejectedValueOnce(new Error("Mirror 503")).mockResolvedValueOnce(undefined);

    const failures = await publishDecisions(
      [decision(), decision({ scheduleId: TRANSFER, kind: "treasuryTransfer" })],
      publish,
      options(),
    );

    expect(publish).toHaveBeenCalledTimes(2);
    expect(failures.map(failure => failure.scheduleId)).toEqual([UPGRADE]);
  });
});
