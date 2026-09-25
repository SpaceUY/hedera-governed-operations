import { createQueryWrapper, jsonResponse } from "./testUtils";
import { useProposals } from "./useProposals";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCouncilKey, fetchProposerAccountIds } from "~~/services/governance/council";
import type { MirrorSchedule } from "~~/services/mirror";
import executedSchedule from "~~/services/mirror/__fixtures__/schedule-executed.json";

// The proposers come from the JSON-RPC relay, which viem cannot reach under jsdom; the rest of the
// inbox goes through the real services against a stubbed Mirror Node.
vi.mock("~~/services/governance/council", async () => ({
  ...(await vi.importActual<typeof import("~~/services/governance/council")>("~~/services/governance/council")),
  fetchCouncilKey: vi.fn(),
  fetchProposerAccountIds: vi.fn(),
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

beforeEach(() => {
  vi.mocked(fetchCouncilKey).mockResolvedValue(council);
  vi.mocked(fetchProposerAccountIds).mockResolvedValue({ accountIds: [ALICE], unresolvable: [] });
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

  it("slows down once every proposal has settled", async () => {
    const fetchMock = stubMirrorWith(proposalPage({}));

    renderHook(() => useProposals(options), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, A_FEW_POLLS_MS));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("exposes the council, so a screen needs no second hook to show m of n", async () => {
    stubMirrorWith(proposalPage({}));

    const { result } = renderHook(() => useProposals(options), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.council.data?.key).toEqual(council));
  });
});
