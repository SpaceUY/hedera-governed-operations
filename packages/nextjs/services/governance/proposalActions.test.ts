import {
  canBeSigned,
  canBeWithdrawnBy,
  canCancelRegistryEntry,
  canOpenProposal,
  canShowIntent,
  cancelPlanOf,
  cancellableRegistryId,
  otherOpenScheduleOf,
} from "./proposalActions";
import type { ScheduledOperation } from "@sh/core/governance/proposalTypes";
import type { RegistryCrossCheck, RegistryEntry } from "@sh/core/governance/registry";
import type { MirrorSchedule, ScheduleExecution, ScheduleState, ScheduleStatus } from "@sh/core/mirror";
import executedSchedule from "@sh/core/mirror/__fixtures__/schedule-executed.json";
import rowsAtRevert from "@sh/core/mirror/__fixtures__/transactions-at-reverted.json";
import { describe, expect, it } from "vitest";

const stateOf = (status: ScheduleStatus): ScheduleState => ({
  status,
  signatureCount: 1,
  executedAt: null,
  expiresAt: null,
  isSettled: status !== "pending",
});

const REGISTRY_CALL: ScheduledOperation = {
  kind: "registryCall",
  executorContractId: "0.0.10671156",
  proposalId: 7,
  gas: 130_000,
  payableTinybars: 0n,
};

const TRANSFER: ScheduledOperation = { kind: "treasuryTransfer", hbar: [], tokens: [] };

const PROPOSER = "0xf2b17e6774b48f1073a94b78791aaa02698d1620";
const GOVERNANCE_EVM_ADDRESS = "0x0000000000000000000000000000000000009999";

const entryOf = (overrides: Partial<RegistryEntry> = {}): RegistryCrossCheck => ({
  status: "read",
  entry: {
    proposalId: 7,
    state: "pending",
    target: "0x3f806946439c3521eeD7d740c3f84E09888C0419",
    proposer: PROPOSER,
    calldata: "0x",
    operation: {
      kind: "upgrade",
      target: "0x3f806946439c3521eeD7d740c3f84E09888C0419",
      implementation: "0x0000000000000000000000000000000000a2d434",
      initializerCalldata: "0x",
      initializer: { kind: "none" },
    },
    ...overrides,
  },
});

describe("canBeSigned", () => {
  it("offers a signature on a pending registry call whose entry is pending and understood", () => {
    expect(canBeSigned({ state: stateOf("pending"), operation: REGISTRY_CALL, registry: entryOf() })).toBe(true);
  });

  it("offers a signature on a pending native proposal, which has no registry entry", () => {
    expect(canBeSigned({ state: stateOf("pending"), operation: TRANSFER, registry: { status: "notApplicable" } })).toBe(
      true,
    );
  });

  it.each(["executed", "deleted", "expired"] as const)("refuses once the schedule is %s", status => {
    expect(canBeSigned({ state: stateOf(status), operation: REGISTRY_CALL, registry: entryOf() })).toBe(false);
  });

  it("refuses when the entry behind the schedule was cancelled, since executing it would revert", () => {
    expect(
      canBeSigned({ state: stateOf("pending"), operation: REGISTRY_CALL, registry: entryOf({ state: "cancelled" }) }),
    ).toBe(false);
  });

  it("refuses when the entry stores a call this template does not recognise", () => {
    const registry = entryOf({
      operation: { kind: "unrecognized", target: "0x00", calldata: "0xdeadbeef", reason: "unknown selector" },
    });
    expect(canBeSigned({ state: stateOf("pending"), operation: REGISTRY_CALL, registry })).toBe(false);
  });

  it("refuses when the registry has no entry for the id the schedule names", () => {
    const registry: RegistryCrossCheck = { status: "missing", reason: "the registry holds no entry 7" };
    expect(canBeSigned({ state: stateOf("pending"), operation: REGISTRY_CALL, registry })).toBe(false);
  });

  it.each([REGISTRY_CALL, TRANSFER])("refuses an entry that was not read, whatever the kind", operation => {
    expect(canBeSigned({ state: stateOf("pending"), operation, registry: { status: "notRead" } })).toBe(false);
  });

  it("still offers a signature while the relay cannot be read, since the network is the final check", () => {
    const registry: RegistryCrossCheck = { status: "unreachable", reason: "fetch failed" };
    expect(canBeSigned({ state: stateOf("pending"), operation: REGISTRY_CALL, registry })).toBe(true);
  });

  it("refuses a native kind that somehow carries a registry answer", () => {
    expect(canBeSigned({ state: stateOf("pending"), operation: TRANSFER, registry: entryOf() })).toBe(false);
  });

  it("refuses a scheduled body the decoder did not understand", () => {
    const operation: ScheduledOperation = { kind: "unrecognized", reason: "unknown body" };
    expect(canBeSigned({ state: stateOf("pending"), operation, registry: { status: "notApplicable" } })).toBe(false);
  });
});

describe("canShowIntent", () => {
  it("agrees with canBeSigned for a registry call the app can vouch for", () => {
    expect(canShowIntent({ state: stateOf("pending"), operation: REGISTRY_CALL, registry: entryOf() })).toBe(true);
  });

  it("draws no preview for a registry call the relay could not read, unlike canBeSigned", () => {
    const registry: RegistryCrossCheck = { status: "unreachable", reason: "fetch failed" };
    const facts = { state: stateOf("pending"), operation: REGISTRY_CALL, registry };
    expect(canShowIntent(facts)).toBe(false);
    expect(canBeSigned(facts)).toBe(true);
  });
});

describe("canBeWithdrawnBy", () => {
  const PROPOSER = "0.0.10671142";
  const schedule: MirrorSchedule = { ...executedSchedule, creator_account_id: PROPOSER };

  it("lets the proposer withdraw a pending proposal, since their key is the schedule's admin key", () => {
    expect(canBeWithdrawnBy({ schedule, state: stateOf("pending") }, PROPOSER)).toBe(true);
  });

  it("hides the action from any other account, whose ScheduleDelete the network would refuse", () => {
    expect(canBeWithdrawnBy({ schedule, state: stateOf("pending") }, "0.0.10671144")).toBe(false);
  });

  it("hides the action when no wallet is connected", () => {
    expect(canBeWithdrawnBy({ schedule, state: stateOf("pending") }, null)).toBe(false);
  });

  it("hides the action once the schedule has settled", () => {
    expect(canBeWithdrawnBy({ schedule, state: stateOf("executed") }, PROPOSER)).toBe(false);
  });
});

describe("canOpenProposal", () => {
  const proposers = ["0.0.1001"];

  it("needs a connected account", () => {
    expect(canOpenProposal("treasuryTransfer", null, proposers)).toBe(false);
  });

  it("lets any connected account open a native proposal", () => {
    expect(canOpenProposal("treasuryTransfer", "0.0.5555", proposers)).toBe(true);
  });

  it("needs PROPOSER_ROLE for a registry proposal, since createProposal reverts without it", () => {
    expect(canOpenProposal("upgrade", "0.0.5555", proposers)).toBe(false);
    expect(canOpenProposal("upgrade", "0.0.1001", proposers)).toBe(true);
  });
});

describe("cancellableRegistryId", () => {
  const NOT_RUN: ScheduleExecution = { status: "notRun" };
  const FAILED: ScheduleExecution = {
    status: "failed",
    result: "CONTRACT_REVERT_EXECUTED",
    transaction: rowsAtRevert.transactions[0],
  };

  it.each(["deleted", "expired"] as const)("offers to cancel a pending entry once its schedule is %s", status => {
    expect(cancellableRegistryId({ state: stateOf(status), execution: NOT_RUN, registry: entryOf() })).toBe(7);
  });

  it("offers to cancel a pending entry once its schedule ran and failed, since a schedule runs once", () => {
    expect(cancellableRegistryId({ state: stateOf("executed"), execution: FAILED, registry: entryOf() })).toBe(7);
  });

  it("holds cancel back while a live schedule could still reach its threshold", () => {
    expect(cancellableRegistryId({ state: stateOf("pending"), execution: NOT_RUN, registry: entryOf() })).toBeNull();
  });

  it("offers nothing once the entry is no longer pending", () => {
    const registry = entryOf({ state: "cancelled" });
    expect(cancellableRegistryId({ state: stateOf("executed"), execution: FAILED, registry })).toBeNull();
  });

  it("offers nothing for a native kind, which has no entry", () => {
    const registry: RegistryCrossCheck = { status: "notApplicable" };
    expect(cancellableRegistryId({ state: stateOf("deleted"), execution: NOT_RUN, registry })).toBeNull();
  });
});

describe("cancelPlanOf", () => {
  const CREATOR = "0.0.10671142";
  const schedule: MirrorSchedule = { ...executedSchedule, creator_account_id: CREATOR };
  const NOT_RUN: ScheduleExecution = { status: "notRun" };

  it("deletes the live schedule first, then cancels, when the schedule's creator asks", () => {
    const proposal = { schedule, state: stateOf("pending"), execution: NOT_RUN, registry: entryOf() };
    expect(cancelPlanOf(proposal, CREATOR)).toEqual({ registryProposalId: 7, withdrawFirst: true });
  });

  it("offers nothing while the schedule is live to anyone who cannot delete it", () => {
    const proposal = { schedule, state: stateOf("pending"), execution: NOT_RUN, registry: entryOf() };
    expect(cancelPlanOf(proposal, "0.0.10671144")).toBeNull();
    expect(cancelPlanOf(proposal, null)).toBeNull();
  });

  it.each(["deleted", "expired"] as const)("is cancel alone, for anyone, once the schedule is %s", status => {
    const proposal = { schedule, state: stateOf(status), execution: NOT_RUN, registry: entryOf() };
    expect(cancelPlanOf(proposal, "0.0.10671144")).toEqual({ registryProposalId: 7, withdrawFirst: false });
  });

  it("offers nothing once the entry is no longer pending, or for a native kind", () => {
    const cancelled = {
      schedule,
      state: stateOf("pending"),
      execution: NOT_RUN,
      registry: entryOf({ state: "cancelled" }),
    };
    expect(cancelPlanOf(cancelled, CREATOR)).toBeNull();
    const native = {
      schedule,
      state: stateOf("pending"),
      execution: NOT_RUN,
      registry: { status: "notApplicable" } as const,
    };
    expect(cancelPlanOf(native, CREATOR)).toBeNull();
  });
});

describe("canCancelRegistryEntry", () => {
  it("authorizes the entry's own proposer", () => {
    expect(canCancelRegistryEntry(PROPOSER, PROPOSER, GOVERNANCE_EVM_ADDRESS)).toBe(true);
  });

  it("authorizes the governance account, the only EXECUTOR_ROLE holder in this template", () => {
    expect(canCancelRegistryEntry(PROPOSER, GOVERNANCE_EVM_ADDRESS, GOVERNANCE_EVM_ADDRESS)).toBe(true);
  });

  it("refuses anyone else, whose cancel call the contract would revert", () => {
    const stranger = "0x00000000000000000000000000000000000000ff";
    expect(canCancelRegistryEntry(PROPOSER, stranger, GOVERNANCE_EVM_ADDRESS)).toBe(false);
  });

  it("refuses with no wallet connected", () => {
    expect(canCancelRegistryEntry(PROPOSER, null, GOVERNANCE_EVM_ADDRESS)).toBe(false);
  });

  it("refuses the proposer match while the governance account's own address is not known yet", () => {
    expect(canCancelRegistryEntry(PROPOSER, "0x00000000000000000000000000000000000000ff", null)).toBe(false);
  });

  it("compares case-insensitively, since a decoded address is EIP-55 checksummed regardless of how it arrived", () => {
    expect(canCancelRegistryEntry(PROPOSER.toUpperCase().replace("0X", "0x"), PROPOSER, GOVERNANCE_EVM_ADDRESS)).toBe(
      true,
    );
  });
});

describe("otherOpenScheduleOf", () => {
  const scheduleWithId = (schedule_id: string) => ({ schedule_id }) as MirrorSchedule;
  const viewed = { schedule: scheduleWithId("0.0.1"), registry: entryOf() };
  const round = (
    scheduleId: string,
    overrides: Partial<{ status: ScheduleStatus; proposalId: number; registry: RegistryCrossCheck }> = {},
  ) => ({
    schedule: scheduleWithId(scheduleId),
    state: stateOf(overrides.status ?? "pending"),
    operation: { ...REGISTRY_CALL, proposalId: overrides.proposalId ?? 7 },
    registry: overrides.registry ?? entryOf(),
  });

  it("finds another pending schedule for the same entry", () => {
    expect(otherOpenScheduleOf(viewed, [round("0.0.1", { status: "deleted" }), round("0.0.2")])).toBe("0.0.2");
  });

  it("counts one the relay could not be asked about, since it cannot be ruled out", () => {
    const unreachable: RegistryCrossCheck = { status: "unreachable", reason: "timeout" };
    expect(otherOpenScheduleOf(viewed, [round("0.0.2", { registry: unreachable })])).toBe("0.0.2");
  });

  it("ignores the viewed schedule itself, settled rounds, other entries and other registries", () => {
    const otherRegistry: RegistryCrossCheck = { status: "missing", reason: "the call names 0.0.9, not this registry" };
    const inbox = [
      round("0.0.1"),
      round("0.0.3", { status: "expired" }),
      round("0.0.4", { proposalId: 8 }),
      round("0.0.5", { registry: otherRegistry }),
      { ...round("0.0.6"), operation: TRANSFER, registry: { status: "notApplicable" } as RegistryCrossCheck },
    ];
    expect(otherOpenScheduleOf(viewed, inbox)).toBeNull();
  });

  it("has nothing to compare against when the viewed entry was not read", () => {
    const notRead = { ...viewed, registry: { status: "notRead" } as RegistryCrossCheck };
    expect(otherOpenScheduleOf(notRead, [round("0.0.2")])).toBeNull();
  });
});
