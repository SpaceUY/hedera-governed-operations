import type { ReactNode } from "react";
import { MapPlaybackProvider, useMapPlayback, useShownProposal, useShownProposals } from "./MapPlaybackProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { GOVERNANCE_MUTATION_KEYS } from "~~/hooks/governanceMutationKeys";
import { useMapSnapshot } from "~~/hooks/mirror/useMapSnapshot";
import type { AnimationEvent, GovernanceSnapshot } from "~~/services/liveMap/events/mapEvents";
import { ALICE, TRANSFER, ago, proposal, world } from "~~/services/liveMap/motion/motionFixtures";
import { proposalIn } from "~~/services/liveMap/motion/world";

vi.mock("~~/hooks/mirror/useMapSnapshot", () => ({ useMapSnapshot: vi.fn() }));

const CONFIG = {
  governanceAccountId: "0.0.4000",
  demoTokenId: "0.0.6000",
  seedProposalId: 1,
  network: "testnet",
  executor: { address: "0x5aF0000000000000000000000000000000000000", abi: [], hederaContractId: "0.0.5000" },
  vault: { address: "0x3f806946439c3521eeD7d740c3f84E09888C0419", abi: [], hederaContractId: "0.0.5001" },
} as GovernanceConfig;

const BEFORE = world([proposal({ id: "0.0.1", operation: TRANSFER })]);
const AFTER = world([proposal({ id: "0.0.1", operation: TRANSFER, signatures: [[ALICE, ago(2)]] })]);
const APPROVED: AnimationEvent = { kind: "approved", scheduleId: "0.0.1", memberKey: ALICE, at: ago(2) };

const liveProposalOf = (read: GovernanceSnapshot) => read.proposals[0];

function readSnapshots(read: {
  snapshot: GovernanceSnapshot;
  previous: GovernanceSnapshot | null;
  events: AnimationEvent[];
}) {
  vi.mocked(useMapSnapshot).mockReturnValue({ ...read, readAt: 1, error: null } as ReturnType<typeof useMapSnapshot>);
}

function withPlayback(queryClient = new QueryClient()) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MapPlaybackProvider config={CONFIG}>{children}</MapPlaybackProvider>
    </QueryClientProvider>
  );
  return Wrapper;
}

/** Walks the clock a step at a time, as each step's timer is only set once the step has rendered. */
function playOut() {
  for (let elapsed = 0; elapsed < 20_000; elapsed += 100) act(() => void vi.advanceTimersByTime(100));
}

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

describe("MapPlaybackProvider", () => {
  it("reads the map's world once for the layout, from the configured accounts", () => {
    readSnapshots({ snapshot: BEFORE, previous: null, events: [] });
    const { result } = renderHook(() => useMapPlayback(), { wrapper: withPlayback() });
    expect(result.current).toMatchObject({ snapshot: BEFORE, world: BEFORE, playing: null, busy: [] });
    expect(useMapSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ governanceAccountId: "0.0.4000", executorContractId: "0.0.5000", network: "testnet" }),
    );
  });

  it("holds a proposal the map is playing and releases it when the run lands", () => {
    readSnapshots({ snapshot: AFTER, previous: BEFORE, events: [APPROVED] });
    const { result } = renderHook(() => useShownProposal(liveProposalOf(AFTER)), { wrapper: withPlayback() });
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.proposal).toBe(proposalIn(BEFORE, "0.0.1"));

    playOut();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.proposal).toBe(liveProposalOf(AFTER));
  });

  it("holds the list's copies the same way, leaving the rest live", () => {
    const other = proposal({ id: "0.0.2", operation: TRANSFER });
    readSnapshots({ snapshot: AFTER, previous: BEFORE, events: [APPROVED] });
    const live = [liveProposalOf(AFTER), other];
    const { result } = renderHook(() => useShownProposals(live), { wrapper: withPlayback() });
    expect(result.current).toEqual([proposalIn(BEFORE, "0.0.1"), other]);

    playOut();
    expect(result.current).toEqual(live);
  });

  it("shows a proposal as the map draws it while this session's signature on it is on its way", () => {
    readSnapshots({ snapshot: BEFORE, previous: null, events: [] });
    const queryClient = new QueryClient();
    // A lookup of the schedule may read the signature before the map's inbox does.
    const fresher = liveProposalOf(AFTER);
    const { result } = renderHook(() => useShownProposal(fresher), { wrapper: withPlayback(queryClient) });
    expect(result.current.proposal).toBe(fresher);

    act(() => {
      void queryClient
        .getMutationCache()
        .build(queryClient, {
          mutationKey: GOVERNANCE_MUTATION_KEYS.sign,
          mutationFn: () => new Promise(() => undefined),
        })
        .execute("0.0.1");
    });
    // The mutation cache tells its observers on the next tick.
    act(() => void vi.advanceTimersByTime(1));

    expect(result.current).toEqual({ proposal: proposalIn(BEFORE, "0.0.1"), isPlaying: false });
  });

  it("refuses to be read outside the governance layout", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useMapPlayback())).toThrow(/inside the governance layout/);
  });
});
