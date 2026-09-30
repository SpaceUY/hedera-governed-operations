import {
  type DemoMember,
  awaitsSignatureFrom,
  demoMemberLabel,
  demoMembersToOffer,
  fetchDemoMembers,
  requestDemoSignature,
} from "./demoSigners";
import type { CouncilKey, ThresholdProgress } from "@sh/core/governance/council";
import type { ScheduledOperation } from "@sh/core/governance/proposalTypes";
import type { Proposal } from "@sh/core/governance/proposals";
import type { MirrorSchedule } from "@sh/core/mirror";
import executedSchedule from "@sh/core/mirror/__fixtures__/schedule-executed.json";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "~~/hooks/mirror/testUtils";

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
    execution: { status: "notRun" },
    progress: progressOf([]),
    incomingProgress: null,
    operation: TRANSFER,
    registry: { status: "notApplicable" },
    ...overrides,
  } as Proposal;
}

afterEach(() => vi.unstubAllGlobals());

describe("demoMembersToOffer", () => {
  it("offers every demo member of the council who has not signed", () => {
    expect(demoMembersToOffer([alice, bob], proposalWith(), council)).toEqual([alice, bob]);
  });

  it("stops offering a member once Mirror lists the signature", () => {
    expect(demoMembersToOffer([alice, bob], proposalWith({ progress: progressOf([ALICE]) }), council)).toEqual([bob]);
  });

  it("offers nobody the council no longer seats", () => {
    expect(demoMembersToOffer([alice, bob], proposalWith(), { threshold: 1, memberKeys: [OWNER] })).toEqual([]);
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

describe("the requests", () => {
  it("asks the route for its members", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ members: [alice] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchDemoMembers()).resolves.toEqual([alice]);
    expect(fetchMock).toHaveBeenCalledWith("/api/demo/signers");
  });

  it("posts only the schedule and the member, as JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ transactionId: "0.0.11@1.1" }));
    vi.stubGlobal("fetch", fetchMock);
    await requestDemoSignature({ scheduleId: "0.0.9001", member: "alice" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/demo/signers");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ scheduleId: "0.0.9001", member: "alice" });
  });

  it("throws the route's own refusal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Not waiting on 0.0.11." }, 409)));
    await expect(requestDemoSignature({ scheduleId: "0.0.9001", member: "alice" })).rejects.toThrow(
      "Not waiting on 0.0.11.",
    );
  });

  it("names only the status when the route answers with something that is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>oops</html>", { status: 500 })));
    await expect(fetchDemoMembers()).rejects.toThrow("The demo signer answered 500");
  });
});
