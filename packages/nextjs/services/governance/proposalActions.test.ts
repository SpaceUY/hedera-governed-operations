import { canBeSigned } from "./proposalActions";
import type { ScheduledOperation } from "./proposalTypes";
import type { RegistryCrossCheck, RegistryEntry } from "./registry";
import { describe, expect, it } from "vitest";
import type { ScheduleState, ScheduleStatus } from "~~/services/mirror";

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
