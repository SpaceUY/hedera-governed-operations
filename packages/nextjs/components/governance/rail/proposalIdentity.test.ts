import { proposalIdentityOf } from "./proposalIdentity";
import type { Proposal } from "@sh/core/governance/proposals";
import { describe, expect, it } from "vitest";

const VAULT = "0x3f806946439c3521eeD7d740c3f84E09888C0419";

const REGISTRY_CALL = {
  kind: "registryCall",
  executorContractId: "0.0.5000",
  proposalId: 7,
  gas: 150_000,
  payableTinybars: 0n,
} as const;

const readEntry = (operation: unknown) =>
  ({
    status: "read",
    entry: { proposalId: 7, state: "pending", target: VAULT, proposer: "0x0", calldata: "0x", operation },
  }) as Proposal["registry"];

const UPGRADE = {
  kind: "upgrade",
  target: VAULT,
  implementation: "0x0000000000000000000000000000000000a2d434",
  initializerCalldata: "0x",
  initializer: { kind: "none" },
};

const identityOf = (operation: unknown, registry: unknown) =>
  proposalIdentityOf({ operation, registry } as Pick<Proposal, "operation" | "registry">);

describe("proposalIdentityOf", () => {
  it("flags a scheduled body the decoder could not describe, naming it by the reason", () => {
    expect(identityOf({ kind: "unrecognized", reason: "odd" }, { status: "notApplicable" })).toEqual({
      title: "Not a proposal this template recognises: odd",
      unrecognized: true,
      family: null,
      iconKind: "unrecognized",
    });
  });

  it("names a native proposal by its kind", () => {
    expect(identityOf({ kind: "treasuryTransfer", hbar: [], tokens: [] }, { status: "notApplicable" })).toEqual({
      title: "Pay a supplier",
      unrecognized: false,
      family: "native",
      iconKind: "treasuryTransfer",
    });
  });

  it("titles a council rotation by the council it proposes, whoever opened it", () => {
    const rotation = {
      kind: "councilRotation",
      accountId: "0.0.4000",
      council: { threshold: 3, memberKeys: ["a", "b", "c"] },
    };
    expect(identityOf(rotation, { status: "notApplicable" })).toMatchObject({
      title: "Change to a 3-of-3 council",
      family: "native",
      iconKind: "councilRotation",
    });
  });

  it("names a registry call by the entry it runs until that entry is read", () => {
    expect(identityOf(REGISTRY_CALL, { status: "unreachable", reason: "relay down" })).toEqual({
      title: "Run entry 7 of the registry at 0.0.5000",
      unrecognized: false,
      family: "contract",
      iconKind: "registryCall",
    });
  });

  it("flags a registry entry whose call the decoder could not describe, naming it by the reason", () => {
    const entry = readEntry({ kind: "unrecognized", target: VAULT, calldata: "0x12", reason: "unknown selector" });
    expect(identityOf(REGISTRY_CALL, entry)).toEqual({
      title: `A call to ${VAULT} this template cannot describe: unknown selector`,
      unrecognized: true,
      family: "contract",
      iconKind: "unrecognized",
    });
  });

  it("names a registry call by the operation its entry holds once read", () => {
    expect(identityOf(REGISTRY_CALL, readEntry(UPGRADE))).toEqual({
      title: "Upgrade the vault to v2",
      unrecognized: false,
      family: "contract",
      iconKind: "upgrade",
    });
  });
});
