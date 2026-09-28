// @vitest-environment node
import recorded from "./__fixtures__/scheduled-bodies.json";
import type { CouncilKey } from "./council";
import { type ProposalInbox, fetchProposalInbox, partitionProposals } from "./proposals";
import { REGISTRY_ABI } from "./registry";
import { proto } from "@hiero-ledger/proto";
import { encodeFunctionData, encodeFunctionResult, hexToBytes, parseAbi } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MirrorSchedule, ScheduleStatus } from "~~/services/mirror";
import executedSchedule from "~~/services/mirror/__fixtures__/schedule-executed.json";
import revertedSchedule from "~~/services/mirror/__fixtures__/schedule-reverted.json";
import rowsAtExecution from "~~/services/mirror/__fixtures__/transactions-at-executed.json";
import rowsAtRevert from "~~/services/mirror/__fixtures__/transactions-at-reverted.json";

const GOVERNANCE_ACCOUNT_ID = "0.0.10590498";
const ALICE = "0.0.10671142";
const BOB = "0.0.10671144";
/** The executor the recorded `registryCall` body names, so the inbox accepts the id it carries. */
const EXECUTOR = "0.0.10671156";
const RPC_URL = "https://relay.test/api";
const VAULT_PROXY = "0x3f806946439c3521eeD7d740c3f84E09888C0419";
/** The same executor as EXECUTOR, named the other way a scheduled call can name a contract. */
const EXECUTOR_EVM = "0x0000000000000000000000000000000000a2d434";
const FAR_FUTURE = "9999999999.000000000";

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

/** A proposal still collecting signatures, carrying the recorded `execute(id)` body of entry 7. */
const pendingRegistryProposal = (scheduleId: string) =>
  scheduleOf(scheduleId, {
    executed_timestamp: null,
    deleted: false,
    expiration_time: FAR_FUTURE,
    transaction_body: recorded.registryCall.transactionBody,
  });

const registryEntry = (state: number) =>
  encodeFunctionResult({
    abi: REGISTRY_ABI,
    functionName: "proposal",
    result: {
      target: VAULT_PROXY,
      proposer: ALICE_EVM,
      state,
      data: encodeFunctionData({
        abi: parseAbi(["function upgradeToAndCall(address newImplementation, bytes data)"]),
        functionName: "upgradeToAndCall",
        args: [VAULT_PROXY, "0x"],
      }),
    },
  });

const ALICE_EVM = "0x3353e89f1f9fef7a0881e5e92f8a0a7fd3a13097";

/**
 * Mirror answers are served in the order the proposers are asked for; relay answers are routed by
 * URL, because a registry read and a schedule page are not interchangeable.
 */
const urlOf = (input: unknown): string => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return (input as { url?: string })?.url ?? "";
};

/** What Mirror answers when asked for the transaction at a schedule's `executed_timestamp`. */
let rowsAtExecutedTimestamp: unknown = rowsAtExecution;

const NOT_INDEXED_YET = { transactions: [], links: { next: null } };

function stubSchedulesPerProposer(...pages: (unknown[] | Error)[]) {
  const mirrorAnswers = [...pages];
  const fetchMock = vi.fn((input: unknown) => {
    if (urlOf(input).startsWith(RPC_URL)) return Promise.resolve(nextRelayAnswer());
    if (urlOf(input).includes("/api/v1/transactions")) {
      return Promise.resolve(new Response(JSON.stringify(rowsAtExecutedTimestamp)));
    }
    const page = mirrorAnswers.shift();
    if (page instanceof Error || page === undefined) return Promise.resolve(new Response("not found", { status: 404 }));
    return Promise.resolve(new Response(JSON.stringify({ schedules: page, links: { next: null } })));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

let relayAnswers: (number | Error)[] = [];

const nextRelayAnswer = (): Response => {
  const answer = relayAnswers.shift();
  if (answer === undefined || answer instanceof Error) return new Response("upstream error", { status: 502 });
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: registryEntry(answer) }));
};

const stubRegistryStates = (...states: (number | Error)[]) => {
  relayAnswers = states;
};

function inboxOf(proposerAccountIds: string[], unresolvableProposers: string[] = []) {
  return fetchProposalInbox({
    proposerAccountIds,
    unresolvableProposers,
    governanceAccountId: GOVERNANCE_ACCOUNT_ID,
    council,
    network: "testnet",
    registry: { executorContractId: EXECUTOR, rpcUrl: RPC_URL },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  relayAnswers = [];
  rowsAtExecutedTimestamp = rowsAtExecution;
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

  it("names a role holder that resolved to no account alongside the ones Mirror refused", async () => {
    stubSchedulesPerProposer([scheduleOf("0.0.1")]);

    const { unreachableProposers } = await inboxOf([ALICE], ["0x00000000000000000000000000000000DeaDBeef"]);

    expect(unreachableProposers).toEqual(["0x00000000000000000000000000000000DeaDBeef"]);
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

  /**
   * A rotation needs the incoming council's threshold as well as the current one's, so a single
   * count would leave a bar stuck at its threshold while the proposal is still waiting.
   */
  it("counts a rotation against the council it proposes, as well as the current one", async () => {
    stubSchedulesPerProposer([
      { ...pendingRegistryProposal("0.0.1"), transaction_body: recorded.councilRotation.transactionBody },
    ]);

    const [proposal] = (await inboxOf([ALICE])).proposals;

    expect(proposal.incomingProgress).toMatchObject({ threshold: 2 });
  });

  it("has no second count for a proposal that changes no council", async () => {
    stubSchedulesPerProposer([pendingRegistryProposal("0.0.1")]);
    stubRegistryStates(0);

    const [proposal] = (await inboxOf([ALICE])).proposals;

    expect(proposal.incomingProgress).toBeNull();
  });

  it("says what each proposal does, decoded from its own body", async () => {
    stubSchedulesPerProposer([pendingRegistryProposal("0.0.1")]);
    stubRegistryStates(0);

    const [proposal] = (await inboxOf([ALICE])).proposals;

    expect(proposal.operation).toMatchObject({ kind: "registryCall", proposalId: 7 });
  });
});

function inboxAfter(previous: ProposalInbox) {
  return fetchProposalInbox({
    proposerAccountIds: [ALICE],
    governanceAccountId: GOVERNANCE_ACCOUNT_ID,
    council,
    network: "testnet",
    registry: { executorContractId: EXECUTOR, rpcUrl: RPC_URL },
    previous,
  });
}

/**
 * The network marks a schedule executed whether its transaction succeeded or reverted, so the outcome
 * comes from the scheduled transaction's own row, recorded at the schedule's `executed_timestamp`.
 */
describe("how an executed proposal ended", () => {
  it("reports an execution that succeeded", async () => {
    stubSchedulesPerProposer([scheduleOf("0.0.1")]);

    const [proposal] = (await inboxOf([ALICE])).proposals;

    expect(proposal.execution).toMatchObject({ status: "succeeded" });
  });

  it("reports an execution that reverted, with the network's response code", async () => {
    rowsAtExecutedTimestamp = rowsAtRevert;
    stubSchedulesPerProposer([{ ...revertedSchedule, payer_account_id: GOVERNANCE_ACCOUNT_ID }]);

    const [proposal] = (await inboxOf([ALICE])).proposals;

    expect([proposal.state.status, proposal.execution]).toMatchObject([
      "executed",
      { status: "failed", result: "CONTRACT_REVERT_EXECUTED" },
    ]);
  });

  it("leaves the outcome unconfirmed while Mirror has not indexed it", async () => {
    rowsAtExecutedTimestamp = NOT_INDEXED_YET;
    stubSchedulesPerProposer([scheduleOf("0.0.1")]);

    const [proposal] = (await inboxOf([ALICE])).proposals;

    expect(proposal.execution).toEqual({ status: "unconfirmed" });
  });

  it("reads no outcome for a proposal that never ran", async () => {
    const fetchMock = stubSchedulesPerProposer([scheduleOf("0.0.1", { executed_timestamp: null, deleted: true })]);

    const [proposal] = (await inboxOf([ALICE])).proposals;

    expect([proposal.execution, fetchMock.mock.calls.length]).toEqual([{ status: "notRun" }, 1]);
  });

  it("reuses an outcome the previous read resolved instead of reading it again", async () => {
    stubSchedulesPerProposer([scheduleOf("0.0.1")]);
    const previous = await inboxOf([ALICE]);
    const fetchMock = stubSchedulesPerProposer([scheduleOf("0.0.1")]);

    const [proposal] = (await inboxAfter(previous)).proposals;

    expect([proposal.execution.status, fetchMock.mock.calls.length]).toEqual(["succeeded", 1]);
  });

  it("reads the outcome again when the previous read could not confirm it", async () => {
    rowsAtExecutedTimestamp = NOT_INDEXED_YET;
    stubSchedulesPerProposer([scheduleOf("0.0.1")]);
    const previous = await inboxOf([ALICE]);
    rowsAtExecutedTimestamp = rowsAtExecution;
    stubSchedulesPerProposer([scheduleOf("0.0.1")]);

    const [proposal] = (await inboxAfter(previous)).proposals;

    expect(proposal.execution.status).toBe("succeeded");
  });
});

/**
 * A proposer can call `cancel(id)` straight, with no schedule and no quorum, which kills the entry
 * while its schedule goes on looking open. Without this cross the inbox would invite the council to
 * sign a proposal that reverts with `ProposalNotPending` and charges the governance account for it.
 */
describe("crossing a proposal with its registry entry", () => {
  it("crosses a proposal whose body names the executor by its EVM address", async () => {
    const body = Buffer.from(
      proto.SchedulableTransactionBody.encode({
        contractCall: {
          contractID: { evmAddress: hexToBytes(EXECUTOR_EVM) },
          functionParameters: hexToBytes(`0xfe0d94c1${"00".repeat(31)}07`),
        },
      }).finish(),
    ).toString("base64");
    stubSchedulesPerProposer([{ ...pendingRegistryProposal("0.0.1"), transaction_body: body }]);
    stubRegistryStates(2);

    const [proposal] = (await inboxOf([ALICE])).proposals;

    expect(proposal.registry).toMatchObject({ status: "read", entry: { state: "cancelled" } });
  });

  it("marks a pending proposal dead when its entry was already cancelled", async () => {
    stubSchedulesPerProposer([pendingRegistryProposal("0.0.1")]);
    stubRegistryStates(2);

    const [proposal] = (await inboxOf([ALICE])).proposals;

    expect(proposal.registry).toMatchObject({ status: "read", entry: { state: "cancelled" } });
  });

  it("leaves a proposal that executed successfully uncrossed, since its entry has run", async () => {
    const fetchMock = stubSchedulesPerProposer([
      scheduleOf("0.0.1", { transaction_body: recorded.registryCall.transactionBody }),
    ]);

    const [proposal] = (await inboxOf([ALICE])).proposals;

    const relayReads = fetchMock.mock.calls.filter(([input]) => urlOf(input).startsWith(RPC_URL));
    expect([proposal.registry.status, relayReads.length]).toEqual(["notApplicable", 0]);
  });

  /** A revert leaves the entry as it was, so the council can still schedule `execute(id)` again. */
  it("crosses a proposal whose execution reverted, since the revert left its entry as it was", async () => {
    rowsAtExecutedTimestamp = rowsAtRevert;
    stubSchedulesPerProposer([
      scheduleOf("0.0.1", {
        executed_timestamp: revertedSchedule.executed_timestamp,
        transaction_body: recorded.registryCall.transactionBody,
      }),
    ]);
    stubRegistryStates(0);

    const [proposal] = (await inboxOf([ALICE])).proposals;

    expect(proposal.registry).toMatchObject({ status: "read", entry: { state: "pending" } });
  });

  it("leaves a native proposal uncrossed, since it has no entry at all", async () => {
    stubSchedulesPerProposer([
      pendingRegistryProposal("0.0.1"),
      { ...pendingRegistryProposal("0.0.2"), transaction_body: recorded.councilRotation.transactionBody },
    ]);
    stubRegistryStates(0);

    const { proposals } = await inboxOf([ALICE]);

    expect(proposals.find(proposal => proposal.schedule.schedule_id === "0.0.2")?.registry.status).toBe(
      "notApplicable",
    );
  });

  it("ignores an id that came from a call to some other contract", async () => {
    stubSchedulesPerProposer([pendingRegistryProposal("0.0.1")]);

    const { proposals } = await fetchProposalInbox({
      proposerAccountIds: [ALICE],
      governanceAccountId: GOVERNANCE_ACCOUNT_ID,
      council,
      network: "testnet",
      registry: { executorContractId: "0.0.9999999", rpcUrl: RPC_URL },
    });

    expect(proposals[0].registry.status).toBe("notApplicable");
  });

  it("leaves the row uncrossed rather than failing the inbox when the relay is down", async () => {
    stubSchedulesPerProposer([pendingRegistryProposal("0.0.1")]);
    stubRegistryStates(new Error("relay is down"));

    const [proposal] = (await inboxOf([ALICE])).proposals;

    expect(proposal.registry.status).toBe("unreachable");
  });
});

describe("partitionProposals", () => {
  const withStatus = (id: string, status: ScheduleStatus) => ({
    id,
    state: { status, signatureCount: 0, executedAt: null, expiresAt: null, isSettled: status !== "pending" },
  });

  it("keeps only open approval rounds as pending, in the inbox's order", () => {
    const inbox = [
      withStatus("a", "pending"),
      withStatus("b", "executed"),
      withStatus("c", "pending"),
      withStatus("d", "deleted"),
      withStatus("e", "expired"),
    ];

    const { pending, settled } = partitionProposals(inbox);

    expect(pending.map(proposal => proposal.id)).toEqual(["a", "c"]);
    expect(settled.map(proposal => proposal.id)).toEqual(["b", "d", "e"]);
  });

  it("returns two empty lists for an empty inbox", () => {
    expect(partitionProposals([])).toEqual({ pending: [], settled: [] });
  });
});
