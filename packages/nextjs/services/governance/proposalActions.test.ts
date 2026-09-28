import { canBeSigned, canBeWithdrawnBy, canOpenProposal, cancellableRegistryId } from "./proposalActions";
import type { ScheduledOperation } from "./proposalTypes";
import type { RegistryCrossCheck, RegistryEntry } from "./registry";
import { describe, expect, it } from "vitest";
import type { MirrorSchedule, ScheduleExecution, ScheduleState, ScheduleStatus } from "~~/services/mirror";
import executedSchedule from "~~/services/mirror/__fixtures__/schedule-executed.json";
import rowsAtRevert from "~~/services/mirror/__fixtures__/transactions-at-reverted.json";

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

const entryOf = (overrides: Partial<RegistryEntry> = {}): RegistryCrossCheck => ({
  status: "read",
  entry: {
    proposalId: 7,
    state: "pending",
    target: "0x3f806946439c3521eeD7d740c3f84E09888C0419",
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

  it("refuses while the relay cannot be read, even though the schedule is still pending", () => {
    const registry: RegistryCrossCheck = { status: "unreachable", reason: "fetch failed" };
    expect(canBeSigned({ state: stateOf("pending"), operation: REGISTRY_CALL, registry })).toBe(false);
  });

  it("refuses a native kind that somehow carries a registry answer", () => {
    expect(canBeSigned({ state: stateOf("pending"), operation: TRANSFER, registry: entryOf() })).toBe(false);
  });

  it("refuses a scheduled body the decoder did not understand", () => {
    const operation: ScheduledOperation = { kind: "unrecognized", reason: "unknown body" };
    expect(canBeSigned({ state: stateOf("pending"), operation, registry: { status: "notApplicable" } })).toBe(false);
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
