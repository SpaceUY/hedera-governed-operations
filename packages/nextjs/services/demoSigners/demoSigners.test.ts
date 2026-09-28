import { type DemoMember, awaitsSignatureFrom, demoMemberLabel, demoMembersToOffer } from "./demoSigners";
import { describe, expect, it } from "vitest";
import type { CouncilKey, ThresholdProgress } from "~~/services/governance/council";
import type { ScheduledOperation } from "~~/services/governance/proposalTypes";
import type { Proposal } from "~~/services/governance/proposals";
import type { MirrorSchedule } from "~~/services/mirror";
import executedSchedule from "~~/services/mirror/__fixtures__/schedule-executed.json";

const OWNER = "Axf0o26IIX71WariMWRAq8ZRpK85cmuZseQMZJtvqc8W";
const ALICE = "A8ZOXqRHjGJ59xH6h3Zh96PaVXzEHtJA/DtxSFHTmFO7";
const BOB = "Ax8MbYmp8RO1AM0RSYCMOv2/QHQ60UBTWwtbrbcwzPfs";
const CAROL = "AoSpRFf/h2qFC+yvgDbEhqRkgSZ5IJzANkz+2d4pqDIa";

const council: CouncilKey = { threshold: 2, memberKeys: [OWNER, ALICE, BOB] };
const alice: DemoMember = { name: "alice", accountId: "0.0.11", publicKey: ALICE };
const bob: DemoMember = { name: "bob", accountId: "0.0.12", publicKey: BOB };

const progressOf = (signedBy: string[], threshold = 2): ThresholdProgress => ({
  signed: signedBy.length,
  threshold,
  signedBy,
});

const TRANSFER: ScheduledOperation = { kind: "treasuryTransfer", hbar: [], tokens: [] };

function proposalWith(overrides: Partial<Proposal> = {}): Proposal {
  return {
    schedule: executedSchedule as MirrorSchedule,
    state: { status: "pending", signatureCount: 0, executedAt: null, expiresAt: null, isSettled: false },
    progress: progressOf([]),
    incomingProgress: null,
    execution: { status: "notRun" },
    operation: TRANSFER,
    registry: { status: "notApplicable" },
    ...overrides,
  };
}

describe("demoMembersToOffer", () => {
  it("offers every demo member of the council who has not signed", () => {
    expect(demoMembersToOffer([alice, bob], proposalWith(), council)).toEqual([alice, bob]);
  });

  it("stops offering a member once Mirror lists the signature", () => {
    const proposal = proposalWith({ progress: progressOf([ALICE]) });
    expect(demoMembersToOffer([alice, bob], proposal, council)).toEqual([bob]);
  });

  it("offers nobody the council no longer seats", () => {
    const rotatedOut: CouncilKey = { threshold: 1, memberKeys: [OWNER] };
    expect(demoMembersToOffer([alice, bob], proposalWith(), rotatedOut)).toEqual([]);
  });

  it("offers nobody on a proposal nobody may be asked to sign", () => {
    const executed = proposalWith({
      state: { status: "executed", signatureCount: 2, executedAt: null, expiresAt: null, isSettled: true },
    });
    expect(demoMembersToOffer([alice, bob], executed, council)).toEqual([]);
  });

  it("offers nobody when the server has no demo members", () => {
    expect(demoMembersToOffer([], proposalWith(), council)).toEqual([]);
  });
});

describe("awaitsSignatureFrom", () => {
  const incoming: CouncilKey = { threshold: 2, memberKeys: [OWNER, BOB, CAROL] };
  const rotation: ScheduledOperation = { kind: "councilRotation", accountId: "0.0.10590498", council: incoming };

  it("waits on a member of the incoming council who has not signed, even outside the current one", () => {
    const facts = {
      council: { threshold: 2, memberKeys: [OWNER, ALICE] },
      operation: rotation,
      progress: progressOf([OWNER, ALICE]),
      incomingProgress: progressOf([OWNER]),
    };
    expect(awaitsSignatureFrom(BOB, facts)).toBe(true);
    expect(awaitsSignatureFrom(ALICE, facts)).toBe(false);
  });

  it("ignores the incoming council on any other kind", () => {
    const facts = { council, operation: TRANSFER, progress: progressOf([]), incomingProgress: null };
    expect(awaitsSignatureFrom(CAROL, facts)).toBe(false);
  });
});

describe("demoMemberLabel", () => {
  it("capitalises the member's name", () => {
    expect(demoMemberLabel("alice")).toBe("Alice");
  });
});
