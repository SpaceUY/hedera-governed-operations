import { remainingSignatures, stageTonesOf } from "./proposalProgress";
import type { Proposal } from "@sh/core/governance/proposals";
import type { ScheduleStatus } from "@sh/core/mirror";
import { describe, expect, it } from "vitest";

const progress = (signed: number, threshold = 2) => ({ signed, threshold, signedBy: [] });

const facts = (status: ScheduleStatus, execution: Proposal["execution"]["status"] = "notRun") =>
  ({
    state: { status, signatureCount: 1, executedAt: null, expiresAt: null, isSettled: status !== "pending" },
    execution: { status: execution },
    progress: progress(1),
    incomingProgress: null,
  }) as unknown as Pick<Proposal, "state" | "execution" | "progress" | "incomingProgress">;

describe("remainingSignatures", () => {
  it("counts what the threshold still needs, never below zero", () => {
    expect(remainingSignatures({ progress: progress(1), incomingProgress: null })).toBe(1);
    expect(remainingSignatures({ progress: progress(3), incomingProgress: null })).toBe(0);
  });

  it("adds both councils for a rotation, which waits for each one's threshold", () => {
    expect(remainingSignatures({ progress: progress(1), incomingProgress: progress(0) })).toBe(3);
  });
});

describe("stageTonesOf", () => {
  it("marks signing as under way while the round is live", () => {
    expect(stageTonesOf(facts("pending"))).toEqual({ create: "done", sign: "active", executed: "idle" });
  });

  it("marks every stage done once it ran and succeeded", () => {
    expect(stageTonesOf(facts("executed", "succeeded"))).toEqual({ create: "done", sign: "done", executed: "done" });
  });

  it("marks the run failed when the scheduled call reverted", () => {
    expect(stageTonesOf(facts("executed", "failed")).executed).toBe("failed");
  });

  it("leaves signing and running idle for a round that was withdrawn or expired", () => {
    expect(stageTonesOf(facts("deleted"))).toEqual({ create: "done", sign: "idle", executed: "idle" });
  });
});
