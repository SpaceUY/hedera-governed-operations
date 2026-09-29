import { getDefaultMirrorNetwork } from "./mirrorQuery";
import { recordSentCancel, sentCancelsQueryKey } from "./sentCancels";
import { createQueryWrapper, jsonResponse } from "./testUtils";
import { proposalInboxQueryKey, useProposals } from "./useProposals";
import recorded from "@sh/core/governance/__fixtures__/scheduled-bodies.json";
import { fetchCouncilKey, fetchProposerAccountIds } from "@sh/core/governance/council";
import type { ProposalInbox } from "@sh/core/governance/proposals";
import { type RegistryCrossCheck, fetchRegistryEntries } from "@sh/core/governance/registry";
import type { MirrorSchedule } from "@sh/core/mirror";
import executedSchedule from "@sh/core/mirror/__fixtures__/schedule-executed.json";
import rowsAtExecution from "@sh/core/mirror/__fixtures__/transactions-at-executed.json";
import { QueryClient } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The proposers come from the JSON-RPC relay, which viem cannot reach under jsdom; the rest of the
// inbox goes through the real services against a stubbed Mirror Node.
vi.mock("@sh/core/governance/council", async () => ({
  ...(await vi.importActual<typeof import("@sh/core/governance/council")>("@sh/core/governance/council")),
  fetchCouncilKey: vi.fn(),
  fetchProposerAccountIds: vi.fn(),
}));

// The registry is read through the relay as well; no test here reaches it unless it says so.
vi.mock("@sh/core/governance/registry", async importOriginal => ({
  ...(await importOriginal<typeof import("@sh/core/governance/registry")>()),
  fetchRegistryEntries: vi.fn().mockResolvedValue(new Map()),
}));

const GOVERNANCE_ACCOUNT_ID = "0.0.10590498";
const ALICE = "0.0.10671142";
const FAST_POLL_MS = 20;
const A_FEW_POLLS_MS = 120;

const options = {
  governanceAccountId: GOVERNANCE_ACCOUNT_ID,
  executorContractId: "0.0.10671156",
  pollIntervalMs: FAST_POLL_MS,
};

const council = {
  threshold: 2,
  memberKeys: [
    "Axf0o26IIX71WariMWRAq8ZRpK85cmuZseQMZJtvqc8W",
    "A8ZOXqRHjGJ59xH6h3Zh96PaVXzEHtJA/DtxSFHTmFO7",
    "Ax8MbYmp8RO1AM0RSYCMOv2/QHQ60UBTWwtbrbcwzPfs",
  ],
};

const proposalPage = (overrides: Partial<MirrorSchedule>) => ({
  schedules: [{ ...executedSchedule, payer_account_id: GOVERNANCE_ACCOUNT_ID, ...overrides }],
  links: { next: null },
});

function stubMirrorWith(body: unknown) {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(body)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Serves the schedules page and, separately, the rows Mirror recorded when a schedule ran. */
function stubInboxAndOutcome(body: unknown, rows: unknown) {
  const fetchMock = vi
    .fn()
    .mockImplementation((url: string) =>
      Promise.resolve(jsonResponse(url.includes("/api/v1/transactions") ? rows : body)),
    );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const scheduleReads = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/v1/schedules")).length;

beforeEach(() => {
  vi.mocked(fetchCouncilKey).mockResolvedValue(council);
  vi.mocked(fetchProposerAccountIds).mockResolvedValue({
    accountIds: [ALICE],
    proposers: [{ accountId: ALICE, key: null }],
    unresolvable: [],
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useProposals", () => {
  it("does not read Mirror until the council is known", async () => {
    vi.mocked(fetchProposerAccountIds).mockReturnValue(new Promise(() => {}));
    const fetchMock = stubMirrorWith(proposalPage({}));

    renderHook(() => useProposals(options), { wrapper: createQueryWrapper() });

    await new Promise(resolve => setTimeout(resolve, A_FEW_POLLS_MS));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("counts a proposal's signatures against the council's members", async () => {
    stubMirrorWith(proposalPage({}));

    const { result } = renderHook(() => useProposals(options), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.inbox.data?.proposals).toHaveLength(1));
    expect(result.current.inbox.data?.proposals[0].progress).toMatchObject({ signed: 2, threshold: 2 });
  });

  it("keeps polling while a proposal is still collecting signatures", async () => {
    const fetchMock = stubMirrorWith(proposalPage({ executed_timestamp: null, expiration_time: null }));

    renderHook(() => useProposals(options), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(2));
  });

  it("slows down once every proposal has settled and its outcome is known", async () => {
    const fetchMock = stubInboxAndOutcome(proposalPage({}), rowsAtExecution);

    renderHook(() => useProposals(options), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, A_FEW_POLLS_MS));
    expect(scheduleReads(fetchMock)).toBe(1);
  });

  it("keeps polling while an executed proposal's outcome is not indexed yet", async () => {
    const fetchMock = stubInboxAndOutcome(proposalPage({}), { transactions: [], links: { next: null } });

    renderHook(() => useProposals(options), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(scheduleReads(fetchMock)).toBeGreaterThan(2));
  });

  it("exposes the council, so a screen needs no second hook to show m of n", async () => {
    stubMirrorWith(proposalPage({}));

    const { result } = renderHook(() => useProposals(options), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.council.data?.key).toEqual(council));
  });

  it("reads an entry whose cancel was just sent as cancelled, without writing that into the cache", async () => {
    const pendingEntry = {
      status: "read",
      entry: { proposalId: 7, state: "pending", target: "0x0", proposer: "0x0", calldata: "0x", operation: {} },
    } as unknown as RegistryCrossCheck;
    vi.mocked(fetchRegistryEntries).mockResolvedValue(new Map([[7, pendingEntry]]));
    stubMirrorWith(
      proposalPage({
        executed_timestamp: null,
        expiration_time: null,
        transaction_body: recorded.registryCall.transactionBody,
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useProposals(options), { wrapper: createQueryWrapper(queryClient) });
    const entryState = () => {
      const registry = result.current.inbox.data?.proposals[0]?.registry;
      return registry?.status === "read" ? registry.entry.state : undefined;
    };
    await waitFor(() => expect(entryState()).toBe("pending"));

    const network = getDefaultMirrorNetwork();
    act(() =>
      recordSentCancel(queryClient, sentCancelsQueryKey(network, options.executorContractId), {
        proposalId: 7,
        sentAt: Date.now(),
      }),
    );

    await waitFor(() => expect(entryState()).toBe("cancelled"));
    const cached = queryClient
      .getQueriesData<ProposalInbox>({ queryKey: proposalInboxQueryKey(network) })
      .map(([, data]) => data)
      .find(data => data?.proposals);
    expect(cached?.proposals[0].registry).toMatchObject({ entry: { state: "pending" } });
  });
});
