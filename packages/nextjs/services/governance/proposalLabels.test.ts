import {
  approvalsLabel,
  councilRuleLabel,
  executionFailureLabel,
  proposalStatusLabel,
  registryLabel,
} from "./proposalLabels";
import type { ScheduledOperation } from "@sh/core/governance/proposalTypes";
import type { RegistryCrossCheck } from "@sh/core/governance/registry";
import type { ScheduleExecution, ScheduleState, ScheduleStatus } from "@sh/core/mirror";
import rowsAtExecution from "@sh/core/mirror/__fixtures__/transactions-at-executed.json";
import rowsAtRevert from "@sh/core/mirror/__fixtures__/transactions-at-reverted.json";
import { describe, expect, it } from "vitest";

const progress = (signed: number, threshold: number) => ({ signed, threshold, signedBy: [] });

describe("registryLabel", () => {
  it("names the state of an entry that was read", () => {
    const registry = { status: "read", entry: { state: "cancelled" } } as RegistryCrossCheck;
    expect(registryLabel(registry)).toBe("Cancelled");
  });

  it("explains that a native operation has no registry entry", () => {
    expect(registryLabel({ status: "notApplicable" })).toBe("None: the network runs this operation directly");
  });

  it("says a settled registry call's entry was not read, rather than that it has none", () => {
    expect(registryLabel({ status: "notRead" })).toBe("Not read: the proposal is no longer collecting signatures");
  });

  it("warns against signing when the registry holds no usable entry", () => {
    expect(registryLabel({ status: "missing", reason: "no entry 7" })).toBe("No usable entry: do not sign");
  });

  it("says the registry could not be read rather than that it has no entry", () => {
    expect(registryLabel({ status: "unreachable", reason: "fetch failed" })).toBe("Could not be read right now");
  });
});

describe("councilRuleLabel", () => {
  it("states the council rule", () => {
    expect(councilRuleLabel({ threshold: 2, memberKeys: ["a", "b", "c"] })).toBe("2-of-3");
  });
});

describe("approvalsLabel", () => {
  it("counts signatures against the threshold and says so, not against the council's size", () => {
    expect(approvalsLabel(progress(1, 2), null)).toBe("1 of 2 required signatures");
  });

  it("counts both councils for a rotation, which needs each one's threshold", () => {
    expect(approvalsLabel(progress(2, 2), progress(0, 2))).toBe(
      "Current council: 2 of 2 required signatures · Incoming council: 0 of 2 required signatures",
    );
  });
});

const stateOf = (status: ScheduleStatus): ScheduleState => ({
  status,
  signatureCount: 0,
  executedAt: null,
  expiresAt: null,
  isSettled: status !== "pending",
});

const FAILED: ScheduleExecution = {
  status: "failed",
  result: "CONTRACT_REVERT_EXECUTED",
  transaction: rowsAtRevert.transactions[0],
};
const SUCCEEDED: ScheduleExecution = { status: "succeeded", transaction: rowsAtExecution.transactions[0] };
const REGISTRY_CALL: ScheduledOperation = {
  kind: "registryCall",
  executorContractId: "0.0.10671156",
  proposalId: 7,
  gas: 90_000,
  payableTinybars: 0n,
};
const entryIn = (state: "pending" | "cancelled") =>
  ({ status: "read", entry: { proposalId: 7, state } }) as RegistryCrossCheck;

describe("proposalStatusLabel", () => {
  it("calls an execution that succeeded executed", () => {
    expect(proposalStatusLabel({ state: stateOf("executed"), execution: SUCCEEDED })).toBe("Executed");
  });

  it("does not call an execution that reverted executed", () => {
    expect(proposalStatusLabel({ state: stateOf("executed"), execution: FAILED })).toBe("Failed when it ran");
  });

  it("says the result is still being confirmed while Mirror has not served it", () => {
    expect(proposalStatusLabel({ state: stateOf("executed"), execution: { status: "unconfirmed" } })).toBe(
      "Executed, confirming the result",
    );
  });

  it("uses the schedule's own words for a proposal that never ran", () => {
    expect(proposalStatusLabel({ state: stateOf("deleted"), execution: { status: "notRun" } })).toBe("Withdrawn");
  });
});

describe("executionFailureLabel", () => {
  it("says nothing when nothing failed", () => {
    expect(
      executionFailureLabel({ execution: SUCCEEDED, operation: REGISTRY_CALL, registry: { status: "notApplicable" } }),
    ).toBeNull();
  });

  it("explains that a registry call is retried by scheduling it again, not by proposing it again", () => {
    expect(executionFailureLabel({ execution: FAILED, operation: REGISTRY_CALL, registry: entryIn("pending") })).toBe(
      "The network ran it and answered CONTRACT_REVERT_EXECUTED: nothing changed, and the governance account " +
        "still paid its fee. The registry entry is still pending: retrying means scheduling execute(7) again for " +
        "the council to sign, not proposing it again.",
    );
  });

  it("says a registry call whose entry is no longer pending cannot run again", () => {
    expect(
      executionFailureLabel({ execution: FAILED, operation: REGISTRY_CALL, registry: entryIn("cancelled") }),
    ).toMatch(/The registry entry is cancelled, so it cannot run again\.$/);
  });

  it("does not guess whether it can run again when the entry could not be read", () => {
    expect(
      executionFailureLabel({
        execution: FAILED,
        operation: REGISTRY_CALL,
        registry: { status: "unreachable", reason: "fetch failed" },
      }),
    ).toMatch(/could not be read, so whether it can run again is not known yet\.$/);
  });

  it.each([
    ["the registry has no entry for it", { status: "missing", reason: "no entry 7" }],
    ["it calls another registry", { status: "notApplicable" }],
  ] as const)("says a registry call cannot run again when %s", (_case, registry) => {
    expect(executionFailureLabel({ execution: FAILED, operation: REGISTRY_CALL, registry })).toMatch(
      /There is no usable registry entry behind it, so it cannot run again\.$/,
    );
  });

  it("tells a native proposal to schedule the same operation again", () => {
    const operation: ScheduledOperation = { kind: "treasuryTransfer", hbar: [], tokens: [] };
    expect(executionFailureLabel({ execution: FAILED, operation, registry: { status: "notApplicable" } })).toMatch(
      /To try again, schedule the same operation again\.$/,
    );
  });
});
