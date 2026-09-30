import { PROPOSAL_ROUTES, decodedOperationOf, routeOf } from "./proposalRoutes";
import {
  type ContractProposalKind,
  type NativeProposalKind,
  PROPOSAL_TYPES,
  type ScheduledOperation,
} from "@sh/core/governance/proposalTypes";
import type { RegistryCrossCheck } from "@sh/core/governance/registry";
import { describe, expect, it } from "vitest";

const VAULT = "0x3f806946439c3521eeD7d740c3f84E09888C0419";

const UPGRADE = {
  kind: "upgrade",
  target: VAULT,
  implementation: "0x0000000000000000000000000000000000a2d434",
  initializerCalldata: "0x",
  initializer: { kind: "none" },
} as const;

const PROPOSER = "0x0000000000000000000000000000000000009001";

const READ_ENTRY: RegistryCrossCheck = {
  status: "read",
  entry: { proposalId: 7, state: "pending", target: VAULT, proposer: PROPOSER, calldata: "0x", operation: UPGRADE },
};

const REGISTRY_CALL = {
  kind: "registryCall",
  executorContractId: "0.0.10671156",
  proposalId: 7,
  gas: 150_000,
  payableTinybars: 0n,
} as const;

const CONTRACT_KINDS: ContractProposalKind[] = ["upgrade", "treasurySwap", "tokenAdmin"];
const NATIVE_KINDS: NativeProposalKind[] = ["treasuryTransfer", "councilRotation"];

describe("PROPOSAL_ROUTES", () => {
  it("has a route for every kind of proposal", () => {
    expect(Object.keys(PROPOSAL_ROUTES).sort()).toEqual(Object.keys(PROPOSAL_TYPES).sort());
  });

  it.each(CONTRACT_KINDS)("sends %s through the executor to its subject", kind => {
    expect(PROPOSAL_ROUTES[kind].slice(0, 2)).toEqual([
      { from: "governanceAccount", to: "executor" },
      { from: "executor", to: "subject" },
    ]);
  });

  it.each(NATIVE_KINDS)("never sends %s through the executor", kind => {
    const roles = PROPOSAL_ROUTES[kind].flatMap(({ from, to }) => [from, to]);
    expect(roles).not.toContain("executor");
  });

  it("brings a swap's proceeds from the router to the recipient", () => {
    expect(PROPOSAL_ROUTES.treasurySwap.at(-1)).toEqual({ from: "router", to: "recipient" });
  });
});

describe("decodedOperationOf", () => {
  it("passes a native operation through", () => {
    const operation: ScheduledOperation = { kind: "treasuryTransfer", hbar: [], tokens: [] };
    expect(decodedOperationOf({ operation, registry: { status: "notApplicable" } })).toBe(operation);
  });

  it("reads a registry call's operation out of the entry", () => {
    expect(decodedOperationOf({ operation: REGISTRY_CALL, registry: READ_ENTRY })).toBe(UPGRADE);
  });

  it.each<RegistryCrossCheck>([
    { status: "missing", reason: "no entry" },
    { status: "unreachable", reason: "relay down" },
    { status: "notApplicable" },
  ])("describes a registry call with no readable entry ($status) as unrecognized", registry => {
    expect(decodedOperationOf({ operation: REGISTRY_CALL, registry }).kind).toBe("unrecognized");
  });
});

describe("routeOf", () => {
  it("has no route for an unrecognized operation", () => {
    expect(routeOf({ kind: "unrecognized", reason: "a blob" })).toBeNull();
  });

  it("names the upgrade's target as its subject", () => {
    expect(routeOf(UPGRADE)).toEqual({ kind: "upgrade", steps: PROPOSAL_ROUTES.upgrade, refs: { subject: [VAULT] } });
  });

  it("names the swap's adapter and recipient", () => {
    const route = routeOf({
      kind: "treasurySwap",
      target: "0xAdApTeR0000000000000000000000000000000001",
      tokenOut: "0x0000000000000000000000000000000000001770",
      fee: 3000,
      recipient: "0x0000000000000000000000000000000000000fa0",
      amountInTinybars: 1n,
      amountOutMinimum: 1n,
      deadline: 0,
    });
    expect(route?.refs).toEqual({
      subject: ["0xAdApTeR0000000000000000000000000000000001"],
      recipient: ["0x0000000000000000000000000000000000000fa0"],
    });
  });

  it("names the token a token-admin operation acts on", () => {
    const route = routeOf({ kind: "tokenAdmin", target: VAULT, operation: "pause", token: "0xT", account: null });
    expect(route?.refs).toEqual({ subject: [VAULT], token: ["0xT"] });
  });

  it("splits a transfer into the accounts it debits and the ones it credits, once each", () => {
    const route = routeOf({
      kind: "treasuryTransfer",
      hbar: [
        { accountId: "0.0.4000", tinybars: -300n },
        { accountId: "0.0.7000", tinybars: 100n },
        { accountId: "0.0.7001", tinybars: 200n },
      ],
      tokens: [
        { tokenId: "0.0.6000", accountId: "0.0.4000", amount: -5n },
        { tokenId: "0.0.6000", accountId: "0.0.7000", amount: 5n },
      ],
    });
    expect(route?.refs).toEqual({ governanceAccount: ["0.0.4000"], recipient: ["0.0.7000", "0.0.7001"] });
  });

  it("names the account a rotation rekeys and the incoming council's keys", () => {
    const route = routeOf({
      kind: "councilRotation",
      accountId: "0.0.4000",
      council: { threshold: 2, memberKeys: ["a2V5MQ==", "a2V5NA=="] },
    });
    expect(route?.refs).toEqual({ governanceAccount: ["0.0.4000"], member: ["a2V5MQ==", "a2V5NA=="] });
  });
});
