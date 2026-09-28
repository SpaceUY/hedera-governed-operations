import { type ReactNode, StrictMode } from "react";
import { type MapSnapshotOptions, useMapSnapshot } from "./useMapSnapshot";
import { useProposals } from "./useProposals";
import { useTreasuryFigures } from "./useTreasuryFigures";
import { type CouncilKey, countThresholdSignatures } from "@sh/core/governance/council";
import type { Proposal, ProposalInbox } from "@sh/core/governance/proposals";
import { type MirrorSchedule, deriveScheduleState } from "@sh/core/mirror";
import executedSchedule from "@sh/core/mirror/__fixtures__/schedule-executed.json";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TreasuryFigures } from "~~/services/governance/treasury";

// The hook composes queries the screen already runs; what it adds is the history of their answers,
// so the queries are stood in for by their results.
vi.mock("./useProposals", () => ({ useProposals: vi.fn() }));
vi.mock("./useTreasuryFigures", () => ({ useTreasuryFigures: vi.fn() }));

const [ALICE, BOB, CAROL] = ["YWxpY2U=", "Ym9i", "Y2Fyb2w="];
const COUNCIL: CouncilKey = { threshold: 2, memberKeys: [ALICE, BOB, CAROL] };
const NOW_SECONDS = 1_790_000_000;
const READ_AT = NOW_SECONDS * 1000;
const ago = (seconds: number): string => `${NOW_SECONDS - seconds}.000000000`;

const OPTIONS: MapSnapshotOptions = {
  governanceAccountId: "0.0.4000",
  executorContractId: "0.0.5000",
  vaultContractId: "0.0.5001",
  demoTokenId: "0.0.6000",
  usdcTokenId: "0.0.6001",
  network: "testnet",
};

function proposal(signers: string[]): Proposal {
  const schedule: MirrorSchedule = {
    ...(executedSchedule as MirrorSchedule),
    schedule_id: "0.0.9001",
    creator_account_id: "0.0.4100",
    consensus_timestamp: ago(20),
    executed_timestamp: null,
    expiration_time: null,
    signatures: signers.map(key => ({ consensus_timestamp: ago(3), public_key_prefix: key, signature: "", type: "" })),
  };
  return {
    schedule,
    state: deriveScheduleState(schedule, new Date(READ_AT)),
    execution: { status: "notRun" },
    progress: countThresholdSignatures(schedule, COUNCIL),
    incomingProgress: null,
    operation: { kind: "treasuryTransfer", hbar: [], tokens: [] },
    registry: { status: "notApplicable" },
  };
}

const inboxOf = (...proposals: Proposal[]): ProposalInbox => ({ proposals, unreachableProposers: [] });
const COUNCIL_DATA = { key: COUNCIL, proposerAccountIds: ["0.0.4100"], proposers: [], unresolvableProposers: [] };
const FIGURES: TreasuryFigures = { hbarBalanceTinybar: 1, acmeBalance: 2, usdcBalance: 3, vaultReserveTinybar: 4n };

type Reads = { inbox?: ProposalInbox; treasury?: TreasuryFigures; readAt?: number };

/** What the stood-in queries answer on the next render. */
function answer({ inbox, treasury, readAt = READ_AT }: Reads) {
  vi.mocked(useProposals).mockReturnValue({
    inbox: { data: inbox, dataUpdatedAt: inbox ? readAt : 0 },
    council: { data: COUNCIL_DATA, dataUpdatedAt: READ_AT - 60_000 },
  } as unknown as ReturnType<typeof useProposals>);
  vi.mocked(useTreasuryFigures).mockReturnValue({
    data: treasury,
    dataUpdatedAt: treasury ? readAt : 0,
  } as unknown as ReturnType<typeof useTreasuryFigures>);
}

const render = (wrapper?: ({ children }: { children: ReactNode }) => ReactNode) =>
  renderHook(({ options }) => useMapSnapshot(options), { initialProps: { options: OPTIONS }, wrapper });

beforeEach(() => {
  vi.mocked(useProposals).mockReset();
  vi.mocked(useTreasuryFigures).mockReset();
});

afterEach(cleanup);

describe("useMapSnapshot", () => {
  it("reads through the queries the screen already polls, on the same network", () => {
    answer({});
    render();

    expect(useProposals).toHaveBeenCalledWith({
      governanceAccountId: "0.0.4000",
      executorContractId: "0.0.5000",
      network: "testnet",
    });
    expect(useTreasuryFigures).toHaveBeenCalledWith(
      expect.objectContaining({ governanceAccountId: "0.0.4000", vaultContractId: "0.0.5001", network: "testnet" }),
    );
  });

  it("has no snapshot until the council and the inbox are read, and does not wait for the figures", () => {
    answer({});
    const { result, rerender } = render();
    expect(result.current.snapshot).toBeNull();

    answer({ inbox: inboxOf(proposal([ALICE])) });
    rerender({ options: OPTIONS });

    expect(result.current.snapshot).toMatchObject({ council: COUNCIL, treasury: null });
    expect(result.current.snapshot?.proposals).toHaveLength(1);
  });

  it("only seeds on the first snapshot, however much it already holds", () => {
    answer({ inbox: inboxOf(proposal([ALICE, BOB])), treasury: FIGURES });
    const { result } = render();

    expect(result.current.snapshot?.proposals).toHaveLength(1);
    expect(result.current.events).toEqual([]);
  });

  it("reports what changed between one read and the next", () => {
    answer({ inbox: inboxOf(proposal([ALICE])) });
    const { result, rerender } = render();

    answer({ inbox: inboxOf(proposal([ALICE, BOB])), readAt: READ_AT + 5_000 });
    rerender({ options: OPTIONS });

    expect(result.current.events).toEqual([{ kind: "approved", scheduleId: "0.0.9001", memberKey: BOB, at: ago(3) }]);
  });

  it("keeps the same events across renders that bring no new read, so an effect enqueues them once", () => {
    answer({ inbox: inboxOf(proposal([ALICE])) });
    const { result, rerender } = render();
    const signed = inboxOf(proposal([ALICE, BOB]));
    answer({ inbox: signed });
    rerender({ options: OPTIONS });
    const events = result.current.events;

    rerender({ options: OPTIONS });

    expect(result.current.events).toBe(events);
  });

  it("reports nothing for a refetch that read the same world again", () => {
    answer({ inbox: inboxOf(proposal([ALICE])) });
    const { result, rerender } = render();

    answer({ inbox: inboxOf(proposal([ALICE])), readAt: READ_AT + 5_000 });
    rerender({ options: OPTIONS });

    expect(result.current.events).toEqual([]);
  });

  it("diffs each read against the one just before it, not against the first", () => {
    answer({ inbox: inboxOf(proposal([ALICE])) });
    const { result, rerender } = render();
    answer({ inbox: inboxOf(proposal([ALICE, BOB])) });
    rerender({ options: OPTIONS });

    answer({ inbox: inboxOf(proposal([ALICE, BOB, CAROL])) });
    rerender({ options: OPTIONS });

    expect(result.current.events.map(event => event.kind === "approved" && event.memberKey)).toEqual([CAROL]);
  });

  it("keeps the last snapshot while a read is in flight, and diffs the next one against it", () => {
    answer({ inbox: inboxOf(proposal([ALICE])) });
    const { result, rerender } = render();
    const seeded = result.current.snapshot;

    answer({});
    rerender({ options: OPTIONS });
    expect(result.current.snapshot).toBe(seeded);

    answer({ inbox: inboxOf(proposal([ALICE, BOB])) });
    rerender({ options: OPTIONS });
    expect(result.current.events.map(event => event.kind)).toEqual(["approved"]);
  });

  it("dates freshness by when the queries read, so a read long after the change reports nothing", () => {
    answer({ inbox: inboxOf(proposal([ALICE])) });
    const { result, rerender } = render();

    answer({ inbox: inboxOf(proposal([ALICE, BOB])), readAt: READ_AT + 10 * 60_000 });
    rerender({ options: OPTIONS });

    expect(result.current.events).toEqual([]);
  });

  it("starts over when pointed at another governance account instead of diffing the two", () => {
    answer({ inbox: inboxOf() });
    const { result, rerender } = render();

    answer({ inbox: inboxOf(proposal([ALICE])) });
    rerender({ options: { ...OPTIONS, governanceAccountId: "0.0.4999" } });

    expect(result.current.snapshot?.proposals).toHaveLength(1);
    expect(result.current.events).toEqual([]);
  });

  it("under StrictMode, seeds on mount and reports a change exactly once", () => {
    answer({ inbox: inboxOf(proposal([ALICE])) });
    const { result, rerender } = render(StrictMode);
    expect(result.current.events).toEqual([]);

    answer({ inbox: inboxOf(proposal([ALICE, BOB])) });
    rerender({ options: OPTIONS });

    expect(result.current.events).toEqual([{ kind: "approved", scheduleId: "0.0.9001", memberKey: BOB, at: ago(3) }]);
  });
});
