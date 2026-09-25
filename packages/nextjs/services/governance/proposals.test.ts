import type { CouncilKey } from "./council";
import { fetchProposalInbox } from "./proposals";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MirrorSchedule } from "~~/services/mirror";
import executedSchedule from "~~/services/mirror/__fixtures__/schedule-executed.json";

const GOVERNANCE_ACCOUNT_ID = "0.0.10590498";
const ALICE = "0.0.10671142";
const BOB = "0.0.10671144";

const council: CouncilKey = {
  threshold: 2,
  memberKeys: [
    "Axf0o26IIX71WariMWRAq8ZRpK85cmuZseQMZJtvqc8W",
    "A8ZOXqRHjGJ59xH6h3Zh96PaVXzEHtJA/DtxSFHTmFO7",
    "Ax8MbYmp8RO1AM0RSYCMOv2/QHQ60UBTWwtbrbcwzPfs",
  ],
};

function scheduleOf(scheduleId: string, overrides: Partial<MirrorSchedule> = {}) {
  return {
    ...executedSchedule,
    schedule_id: scheduleId,
    payer_account_id: GOVERNANCE_ACCOUNT_ID,
    ...overrides,
  };
}

/** One Mirror page per proposer, in the order the proposers are asked for. */
function stubSchedulesPerProposer(...pages: (unknown[] | Error)[]) {
  const fetchMock = vi.fn();
  for (const page of pages) {
    if (page instanceof Error) {
      fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 }));
      continue;
    }
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ schedules: page, links: { next: null } })));
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function inboxOf(proposerAccountIds: string[]) {
  return fetchProposalInbox({
    proposerAccountIds,
    governanceAccountId: GOVERNANCE_ACCOUNT_ID,
    council,
    network: "testnet",
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchProposalInbox", () => {
  it("joins the schedules every proposer created", async () => {
    stubSchedulesPerProposer([scheduleOf("0.0.1")], [scheduleOf("0.0.2")]);

    const { proposals } = await inboxOf([ALICE, BOB]);

    expect(proposals.map(proposal => proposal.schedule.schedule_id)).toEqual(["0.0.1", "0.0.2"]);
  });

  it("leaves out a schedule the governance account does not pay for", async () => {
    stubSchedulesPerProposer([scheduleOf("0.0.1"), scheduleOf("0.0.2", { payer_account_id: ALICE })]);

    const { proposals } = await inboxOf([ALICE]);

    expect(proposals.map(proposal => proposal.schedule.schedule_id)).toEqual(["0.0.1"]);
  });

  it("lists a proposal once when the same proposer is enumerated twice", async () => {
    stubSchedulesPerProposer([scheduleOf("0.0.1")], [scheduleOf("0.0.1")]);

    const { proposals } = await inboxOf([ALICE, ALICE]);

    expect(proposals).toHaveLength(1);
  });

  it("puts the newest proposal first", async () => {
    stubSchedulesPerProposer([
      scheduleOf("0.0.older", { consensus_timestamp: "1789669877.191032382" }),
      scheduleOf("0.0.newer", { consensus_timestamp: "1789670094.383668286" }),
    ]);

    const { proposals } = await inboxOf([ALICE]);

    expect(proposals.map(proposal => proposal.schedule.schedule_id)).toEqual(["0.0.newer", "0.0.older"]);
  });

  it("returns the proposals it could read when one proposer fails", async () => {
    stubSchedulesPerProposer([scheduleOf("0.0.1")], new Error("Mirror is down"));

    const { proposals } = await inboxOf([ALICE, BOB]);

    expect(proposals).toHaveLength(1);
  });

  it("names the proposer it could not read, so the list can say it is partial", async () => {
    stubSchedulesPerProposer([scheduleOf("0.0.1")], new Error("Mirror is down"));

    const { unreachableProposers } = await inboxOf([ALICE, BOB]);

    expect(unreachableProposers).toEqual([BOB]);
  });

  it("reads at most one page per proposer", async () => {
    const fetchMock = stubSchedulesPerProposer([scheduleOf("0.0.1")]);

    await inboxOf([ALICE]);

    expect(fetchMock.mock.calls[0][0]).toContain(`account.id=${ALICE}&limit=25&order=desc`);
  });

  it("reports each proposal's progress toward the threshold", async () => {
    stubSchedulesPerProposer([scheduleOf("0.0.1")]);

    const [proposal] = (await inboxOf([ALICE])).proposals;

    expect(proposal.progress).toMatchObject({ signed: 2, threshold: 2 });
  });

  it("derives each proposal's state from its schedule", async () => {
    stubSchedulesPerProposer([scheduleOf("0.0.1", { deleted: true })]);

    const [proposal] = (await inboxOf([ALICE])).proposals;

    expect(proposal.state.status).toBe("deleted");
  });
});
