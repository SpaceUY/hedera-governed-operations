import {
  cardStatusLabel,
  endNote,
  noRejectNote,
  signatureHeadline,
  signedWhenAriaLabel,
  signedWhenLabel,
  stageLines,
} from "./copy";
import { proposalIdentityOf } from "./proposalIdentity";
import type { Proposal } from "@sh/core/governance/proposals";
import type { ScheduleStatus } from "@sh/core/mirror";
import { describe, expect, it } from "vitest";

const REGISTRY_CALL = {
  kind: "registryCall",
  executorContractId: "0.0.5000",
  proposalId: 7,
  gas: 150_000,
  payableTinybars: 0n,
} as const;

const entry = (state: "pending" | "cancelled") =>
  ({
    status: "read",
    entry: {
      proposalId: 7,
      state,
      target: "0x3f806946439c3521eeD7d740c3f84E09888C0419",
      proposer: "0x0",
      calldata: "0x",
      operation: {
        kind: "upgrade",
        target: "0x3f806946439c3521eeD7d740c3f84E09888C0419",
        implementation: "0x0000000000000000000000000000000000a2d434",
        initializerCalldata: "0x",
        initializer: { kind: "none" },
      },
    },
  }) as Proposal["registry"];

const proposal = (status: ScheduleStatus, overrides: Partial<Proposal> = {}) =>
  ({
    state: { status, signatureCount: 1, executedAt: null, expiresAt: null, isSettled: status !== "pending" },
    execution: { status: status === "executed" ? "succeeded" : "notRun" },
    progress: { signed: 1, threshold: 2, signedBy: [] },
    incomingProgress: null,
    operation: REGISTRY_CALL,
    registry: entry("pending"),
    ...overrides,
  }) as unknown as Proposal;

describe("cardStatusLabel", () => {
  it("says how many more signatures a live round needs", () => {
    expect(cardStatusLabel(proposal("pending"))).toBe("1 more needed");
  });

  it("says how a settled round ended, and that its entry was cancelled", () => {
    expect(cardStatusLabel(proposal("deleted", { registry: entry("cancelled") }))).toBe("Withdrawn · entry cancelled");
  });
});

describe("signatureHeadline", () => {
  it("leads with the count while signatures are missing", () => {
    expect(signatureHeadline(proposal("pending"))).toEqual({ count: 1, words: "more signature needed" });
  });

  it("names how it ended once settled", () => {
    expect(signatureHeadline(proposal("executed"))).toEqual({ count: null, words: "Executed" });
  });
});

describe("stageLines", () => {
  it("never calls registering a council vote, and says which signature runs it", () => {
    const lines = stageLines(proposal("pending"), "contract", "2-of-3");
    expect(lines.create).toMatch(/Not a council vote/);
    expect(lines.sign).toBe("1 more signature needed, in any order");
    expect(lines.executed).toBe("Runs by itself at the 2nd signature. No execute button.");
  });
});

describe("noRejectNote", () => {
  it("says when an unsigned schedule expires", () => {
    const now = new Date(2030, 0, 1);
    const note = noRejectNote(new Date(now.getTime() + 26 * 60 * 60_000), now);
    expect(note.rest).toMatch(/expires on its own — 1d 2h from now/);
  });
});

describe("endNote", () => {
  it("says a withdrawn registry call is still registered, and a cancelled one is over", () => {
    expect(endNote(proposal("deleted"))).toMatch(/still registered/);
    expect(endNote(proposal("deleted", { registry: entry("cancelled") }))).toMatch(/Cancelled for good/);
    expect(endNote(proposal("pending"))).toBeNull();
  });
});

describe("proposalIdentityOf", () => {
  it("names a registry call by its entry's operation once read, and by the entry before", () => {
    expect(proposalIdentityOf(proposal("pending")).title).toBe("Upgrade the vault to v2");
    const unread = proposalIdentityOf(
      proposal("pending", { registry: { status: "unreachable", reason: "relay down" } as Proposal["registry"] }),
    );
    expect(unread).toMatchObject({ title: "Run entry 7 of the registry at 0.0.5000", family: "contract" });
  });

  it("flags a body the decoder could not describe", () => {
    const identity = proposalIdentityOf(proposal("pending", { operation: { kind: "unrecognized", reason: "odd" } }));
    expect(identity).toMatchObject({ unrecognized: true, family: null, iconKind: "unrecognized" });
  });
});

describe("signedWhenLabel", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("says how long ago, in the largest whole unit, within a week", () => {
    expect(signedWhenLabel(ago(42_000), now)).toBe("Signed 42s ago");
    expect(signedWhenLabel(ago(5 * 60_000), now)).toBe("Signed 5m ago");
    expect(signedWhenLabel(ago(3 * 3_600_000 + 59 * 60_000), now)).toBe("Signed 3h ago");
    expect(signedWhenLabel(ago(86_400_000), now)).toBe("Signed 1 day ago");
    expect(signedWhenLabel(ago(6 * 86_400_000), now)).toBe("Signed 6 days ago");
  });

  it("gives the short date from a week on", () => {
    const label = signedWhenLabel(ago(10 * 86_400_000), now);
    expect(label).toBe(
      `Signed ${ago(10 * 86_400_000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
    );
  });

  it("names the member and where the link goes", () => {
    expect(signedWhenAriaLabel("Bob", "Signed 3h ago")).toBe("Bob: signed 3h ago — open the signature on HashScan");
  });
});
