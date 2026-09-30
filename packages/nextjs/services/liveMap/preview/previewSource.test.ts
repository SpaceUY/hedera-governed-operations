import { draftPreviewOf, previewModeOf, previewTargetKey, previewTargetOf, selectedPreviewOf } from "./previewSource";
import type { Proposal } from "@sh/core/governance/proposals";
import { type MirrorTransaction, type ScheduleExecution } from "@sh/core/mirror";
import { describe, expect, it } from "vitest";
import { draftTreasuryTransfer, previewDraft } from "~~/services/governance/drafts";
import {
  GOVERNANCE,
  SUCCEEDED,
  SUPPLIER,
  TRANSFER,
  UPGRADE_CALL,
  ago,
  proposal,
} from "~~/services/liveMap/motion/motionFixtures";

const pendingUpgrade = proposal({ id: "0.0.9001", operation: UPGRADE_CALL });
const withState = (base: Proposal, status: "deleted" | "expired"): Proposal => ({
  ...base,
  state: { ...base.state, status, isSettled: true },
});

describe("previewTargetOf", () => {
  it("previews the draft in the wizard, the proposal a route or ?schedule= names, else nothing", () => {
    expect(
      previewTargetOf({ pathname: "/governance/new", routeScheduleId: null, selectedScheduleId: "0.0.1" }),
    ).toEqual({ kind: "draft" });
    expect(
      previewTargetOf({ pathname: "/governance/0.0.7", routeScheduleId: "0.0.7", selectedScheduleId: null }),
    ).toEqual({ kind: "schedule", scheduleId: "0.0.7" });
    expect(previewTargetOf({ pathname: "/", routeScheduleId: null, selectedScheduleId: "0.0.8" })).toEqual({
      kind: "schedule",
      scheduleId: "0.0.8",
    });
    expect(previewTargetOf({ pathname: "/", routeScheduleId: null, selectedScheduleId: null })).toEqual({
      kind: "none",
    });
  });

  it("keys a target so a new one resets what depends on it", () => {
    expect(previewTargetKey({ kind: "schedule", scheduleId: "0.0.8" })).toBe("schedule:0.0.8");
    expect(previewTargetKey({ kind: "draft" })).toBe("draft");
  });
});

describe("previewModeOf", () => {
  it("previews what a pending proposal would do only when its body is known", () => {
    expect(previewModeOf(pendingUpgrade)).toBe("live");
    const unreadable: Proposal = { ...pendingUpgrade, registry: { status: "unreachable", reason: "no answer" } };
    const missing: Proposal = { ...pendingUpgrade, registry: { status: "missing", reason: "reverted" } };
    const unrecognized: Proposal = {
      ...pendingUpgrade,
      operation: { kind: "unrecognized", reason: "extra field" },
      registry: { status: "notApplicable" },
    };
    expect(previewModeOf(unreadable)).toBeNull();
    expect(previewModeOf(missing)).toBeNull();
    expect(previewModeOf(unrecognized)).toBeNull();
  });

  it("shows where a settled proposal went, or would have gone", () => {
    const executed = proposal({ id: "0.0.9002", operation: TRANSFER, executedAt: ago(1), execution: SUCCEEDED });
    const reverted = proposal({
      id: "0.0.9003",
      operation: TRANSFER,
      executedAt: ago(1),
      execution: {
        status: "failed",
        result: "CONTRACT_REVERT_EXECUTED",
        transaction: {} as MirrorTransaction,
      } as ScheduleExecution,
    });
    const unconfirmed = proposal({
      id: "0.0.9004",
      operation: TRANSFER,
      executedAt: ago(1),
      execution: { status: "unconfirmed" },
    });
    expect(previewModeOf(executed)).toBe("history");
    expect(previewModeOf(reverted)).toBeNull();
    expect(previewModeOf(unconfirmed)).toBeNull();
    expect(previewModeOf(withState(pendingUpgrade, "deleted"))).toBe("void");
    expect(previewModeOf(withState(pendingUpgrade, "expired"))).toBe("void");
  });

  it("treats a pending schedule whose registry entry was cancelled as a path never taken", () => {
    if (pendingUpgrade.registry.status !== "read") throw new Error("fixture reads the entry");
    const cancelled: Proposal = {
      ...pendingUpgrade,
      registry: { status: "read", entry: { ...pendingUpgrade.registry.entry, state: "cancelled" } },
    };
    expect(previewModeOf(cancelled)).toBe("void");
  });
});

describe("selectedPreviewOf", () => {
  it("carries the operation the entry holds, the creator and the progress", () => {
    const preview = selectedPreviewOf(pendingUpgrade, 2);
    expect(preview).toMatchObject({
      key: "schedule:0.0.9001",
      mode: "live",
      proposerAccountId: "0.0.4101",
      progress: { signed: 0, remaining: 2 },
    });
    expect(preview?.operation.kind).toBe("upgrade");
  });
});

describe("draftPreviewOf", () => {
  it("keys a draft by its kind only, so typing in the form does not restart the drawing", () => {
    const small = draftPreviewOf(
      previewDraft(draftTreasuryTransfer(GOVERNANCE, { recipientAccountId: SUPPLIER, amount: "1" })),
      null,
    );
    const large = draftPreviewOf(
      previewDraft(draftTreasuryTransfer(GOVERNANCE, { recipientAccountId: SUPPLIER, amount: "40" })),
      null,
    );
    expect(small?.key).toBe("draft:treasuryTransfer");
    expect(large?.key).toBe(small?.key);
    expect(large).toMatchObject({ mode: "live", progress: null, proposerAccountId: null });
  });
});
