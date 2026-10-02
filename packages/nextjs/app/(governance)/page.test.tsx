import GovernanceHomePage from "./page";
import type { Proposal } from "@sh/core/governance/proposals";
import type { ScheduleStatus } from "@sh/core/mirror";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProposalLookup } from "~~/hooks/mirror/useProposalLookup";
import { useProposals } from "~~/hooks/mirror/useProposals";
import { INBOX_COPY } from "~~/services/governance/proposalLabels";

const replace = vi.hoisted(() => vi.fn());
const searchParams = vi.hoisted(() => ({ value: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/",
  useSearchParams: () => searchParams.value,
}));
vi.mock("~~/components/governance/GovernanceProvider", () => ({
  useGovernanceConfig: () => ({
    network: "testnet",
    governanceAccountId: "0.0.10671146",
    executor: { hederaContractId: "0.0.4242" },
  }),
}));
// Nothing plays on the map here: the rail shows the proposals as read.
vi.mock("~~/components/governance/MapPlaybackProvider", () => ({
  useMapPlayback: () => ({ busy: [], world: null }),
  useShownProposals: (proposals: unknown[]) => proposals,
}));
vi.mock("~~/hooks/mirror/useProposals", () => ({ useProposals: vi.fn() }));
vi.mock("~~/hooks/mirror/useProposalLookup", () => ({ useProposalLookup: vi.fn() }));
vi.mock("~~/components/governance/rail/ProposalDetail", () => ({
  ProposalDetail: ({ scheduleId, variant }: { scheduleId: string; variant: string }) => (
    <p data-testid="proposal-detail">
      Detail of {scheduleId} as {variant}
    </p>
  ),
}));

/** A registry call whose entry id doubles as its name on screen: "Run entry N of the registry…". */
const proposal = (scheduleId: string, entry: number, status: ScheduleStatus) =>
  ({
    schedule: { schedule_id: scheduleId },
    state: { status, signatureCount: 2, executedAt: null, expiresAt: null, isSettled: status !== "pending" },
    execution: status === "executed" ? { status: "succeeded" } : { status: "notRun" },
    progress: { signed: status === "executed" ? 2 : 1, threshold: 2, signedBy: [] },
    incomingProgress: null,
    operation: {
      kind: "registryCall",
      proposalId: entry,
      executorContractId: "0.0.4242",
      gas: 90_000,
      payableTinybars: 0n,
    },
    registry: { status: "notApplicable" },
  }) as unknown as Proposal;

const showInbox = (proposals: Proposal[]) =>
  vi.mocked(useProposals).mockReturnValue({
    council: { data: undefined },
    inbox: { data: { proposals, unreachableProposers: [] } },
  } as unknown as ReturnType<typeof useProposals>);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  searchParams.value = new URLSearchParams();
});

describe("GovernanceHomePage", () => {
  it("lists only open approval rounds under Pending operations, and the rest as settled", () => {
    showInbox([
      proposal("0.0.1", 1, "pending"),
      proposal("0.0.2", 2, "executed"),
      proposal("0.0.3", 3, "expired"),
      proposal("0.0.4", 4, "pending"),
    ]);
    searchParams.value = new URLSearchParams("schedule=0.0.1");

    render(<GovernanceHomePage />);

    expect(screen.getByRole("heading", { level: 1, name: INBOX_COPY.pendingHeading })).toBeTruthy();
    expect(screen.getByLabelText("2 pending").textContent).toBe("2");
    const settled = screen.getByRole("region", { name: INBOX_COPY.settledHeading });
    expect(within(settled).getAllByText(/Run entry/)).toHaveLength(2);

    const pendingDescriptions = screen.getAllByText(/Run entry/).filter(node => !settled.contains(node));
    expect(pendingDescriptions).toHaveLength(2);
  });

  it("says under the heading that a proposal runs by itself at the council's threshold, and heads the rest Recent", () => {
    vi.mocked(useProposals).mockReturnValue({
      council: { data: { key: { threshold: 2, memberKeys: ["a", "b", "c"] } } },
      inbox: {
        data: {
          proposals: [proposal("0.0.1", 1, "pending"), proposal("0.0.2", 2, "executed")],
          unreachableProposers: [],
        },
      },
    } as unknown as ReturnType<typeof useProposals>);
    searchParams.value = new URLSearchParams("schedule=0.0.1");

    render(<GovernanceHomePage />);

    const note = screen.getByText(/runs by itself/);
    expect(note.textContent).toBe(
      "Each one runs by itself the moment the 2-of-3 council has signed it. There is no execute button.",
    );
    expect(within(note).getByText("2-of-3 council").tagName).toBe("B");
    expect(screen.getByRole("heading", { level: 2, name: "Recent" })).toBeTruthy();
  });

  it("says nothing is waiting when every proposal has settled", () => {
    showInbox([proposal("0.0.2", 2, "executed")]);
    searchParams.value = new URLSearchParams("schedule=0.0.2");

    render(<GovernanceHomePage />);

    expect(screen.getByText(INBOX_COPY.noPending)).toBeTruthy();
    expect(screen.getByRole("region", { name: INBOX_COPY.settledHeading })).toBeTruthy();
  });

  it("reads a withdrawn proposal whose entry was cancelled afterwards as Cancelled under Settled", () => {
    const withdrawnThenCancelled = {
      ...proposal("0.0.3", 3, "deleted"),
      registry: {
        status: "read",
        entry: {
          proposalId: 3,
          state: "cancelled",
          target: "0x0",
          proposer: "0x0",
          calldata: "0x",
          operation: { kind: "upgrade", target: "0x0", implementation: "0x0", initializer: { kind: "none" } },
        },
      },
    } as unknown as Proposal;
    showInbox([proposal("0.0.1", 1, "pending"), withdrawnThenCancelled]);
    searchParams.value = new URLSearchParams("schedule=0.0.1");

    render(<GovernanceHomePage />);

    const settled = screen.getByRole("region", { name: INBOX_COPY.settledHeading });
    expect(within(settled).getByText("Withdrawn · entry cancelled")).toBeTruthy();
  });

  it("keeps showing the partial-inbox warning when a proposer could not be read", () => {
    vi.mocked(useProposals).mockReturnValue({
      council: { data: undefined },
      inbox: { data: { proposals: [proposal("0.0.1", 1, "pending")], unreachableProposers: ["0.0.999"] } },
    } as unknown as ReturnType<typeof useProposals>);
    searchParams.value = new URLSearchParams("schedule=0.0.1");

    render(<GovernanceHomePage />);

    expect(screen.getByRole("status").textContent).toContain("0.0.999");
  });

  it("says the proposals could not be read, instead of loading forever, when the council read failed", () => {
    const refetch = vi.fn(() => Promise.resolve());
    vi.mocked(useProposals).mockReturnValue({
      council: { data: undefined, isError: true, isFetching: false, refetch },
      inbox: { data: undefined, isError: false, isFetching: false },
    } as unknown as ReturnType<typeof useProposals>);

    render(<GovernanceHomePage />);

    expect(screen.getByRole("alert").textContent).toContain(INBOX_COPY.unreadable);
    expect(screen.queryByRole("status", { name: INBOX_COPY.loading })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: INBOX_COPY.retry }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("pre-selects the first pending proposal when the URL names none", () => {
    showInbox([proposal("0.0.1", 1, "pending"), proposal("0.0.4", 4, "pending")]);

    render(<GovernanceHomePage />);

    expect(replace).toHaveBeenCalledWith("/?schedule=0.0.1", { scroll: false });
  });

  it("does not open a proposal by itself when it turns up after a first read with none pending", () => {
    showInbox([proposal("0.0.2", 2, "executed")]);
    const { rerender } = render(<GovernanceHomePage />);

    showInbox([proposal("0.0.5", 5, "pending"), proposal("0.0.2", 2, "executed")]);
    rerender(<GovernanceHomePage />);

    expect(replace).not.toHaveBeenCalled();
  });

  it("waits for the first inbox read before deciding what to pre-select", () => {
    vi.mocked(useProposals).mockReturnValue({
      council: { data: undefined },
      inbox: { data: undefined },
    } as unknown as ReturnType<typeof useProposals>);
    const { rerender } = render(<GovernanceHomePage />);

    showInbox([proposal("0.0.1", 1, "pending")]);
    rerender(<GovernanceHomePage />);

    expect(replace).toHaveBeenCalledWith("/?schedule=0.0.1", { scroll: false });
  });

  it("does not override a selection the URL already names", () => {
    showInbox([proposal("0.0.1", 1, "pending"), proposal("0.0.4", 4, "pending")]);
    searchParams.value = new URLSearchParams("schedule=0.0.4");

    render(<GovernanceHomePage />);

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { expanded: true }).textContent).toContain("Run entry 4");
  });

  it("marks the row the URL names as selected", () => {
    showInbox([proposal("0.0.1", 1, "pending")]);
    searchParams.value = new URLSearchParams("schedule=0.0.1");

    render(<GovernanceHomePage />);

    expect(screen.getByRole("button", { expanded: true })).toBeTruthy();
  });

  it("opens the selected proposal's detail under its own card, as the inline panel", () => {
    showInbox([proposal("0.0.1", 1, "pending"), proposal("0.0.4", 4, "pending")]);
    searchParams.value = new URLSearchParams("schedule=0.0.4");

    render(<GovernanceHomePage />);

    const detail = screen.getByTestId("proposal-detail");
    expect(detail.textContent).toBe("Detail of 0.0.4 as inline");
    const selectedCard = screen.getByRole("button", { expanded: true }).closest("li");
    expect(selectedCard?.contains(detail)).toBe(true);
  });

  it("selects another card from the list, and closes the open one when it is pressed again", () => {
    showInbox([proposal("0.0.1", 1, "pending"), proposal("0.0.4", 4, "pending")]);
    searchParams.value = new URLSearchParams("schedule=0.0.4");

    render(<GovernanceHomePage />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(replace).toHaveBeenLastCalledWith("/?schedule=0.0.1", { scroll: false });

    fireEvent.click(screen.getByRole("button", { expanded: true }));
    expect(replace).toHaveBeenLastCalledWith("/", { scroll: false });
  });

  it("does not reopen the first pending proposal once the open card was closed", () => {
    showInbox([proposal("0.0.1", 1, "pending")]);
    searchParams.value = new URLSearchParams("schedule=0.0.1");

    const { rerender } = render(<GovernanceHomePage />);
    fireEvent.click(screen.getByRole("button", { expanded: true }));
    searchParams.value = new URLSearchParams();
    rerender(<GovernanceHomePage />);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("proposal-detail")).toBeNull();
  });

  it("shows a schedule the inbox does not list as the search's result, with its detail under that card", () => {
    showInbox([proposal("0.0.1", 1, "pending"), proposal("0.0.2", 2, "executed")]);
    vi.mocked(useProposalLookup).mockReturnValue({
      proposal: proposal("0.0.99", 99, "executed"),
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useProposalLookup>);
    searchParams.value = new URLSearchParams("schedule=0.0.99");

    render(<GovernanceHomePage />);

    const detail = screen.getByTestId("proposal-detail");
    expect(detail.textContent).toBe("Detail of 0.0.99 as inline");
    const search = screen.getByRole("search");
    expect(search.contains(detail)).toBe(true);
    expect(within(search).getByRole("button", { expanded: true }).textContent).toContain("Run entry 99");
    // Settled, but not listed by the inbox: it stays with the search, never among the inbox's own sections.
    expect(screen.getByRole("region", { name: INBOX_COPY.settledHeading }).contains(detail)).toBe(false);
  });

  describe("when the open card moves to another list", () => {
    const scrollIntoView = vi.fn();
    beforeEach(() => {
      Element.prototype.scrollIntoView = scrollIntoView;
    });
    afterEach(() => {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    });

    const withdrawAfterOpening = () => {
      showInbox([proposal("0.0.1", 1, "pending"), proposal("0.0.4", 4, "pending")]);
      searchParams.value = new URLSearchParams("schedule=0.0.1");
      const rendered = render(<GovernanceHomePage />);
      screen.getByRole("button", { expanded: true }).focus();
      showInbox([proposal("0.0.4", 4, "pending"), proposal("0.0.1", 1, "deleted")]);
      return rendered;
    };

    it("keeps it open and puts focus back on its button in the new place, scrolling only as far as needed", () => {
      const { rerender } = withdrawAfterOpening();

      rerender(<GovernanceHomePage />);

      const settled = screen.getByRole("region", { name: INBOX_COPY.settledHeading });
      const moved = within(settled).getByRole("button", { expanded: true });
      expect(moved.textContent).toContain("Run entry 1");
      expect(document.activeElement).toBe(moved);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
      expect(replace).not.toHaveBeenCalled();
    });

    it("leaves focus where the viewer already moved it", () => {
      const { rerender } = withdrawAfterOpening();
      const field = screen.getByLabelText(/Find a proposal/);
      field.focus();

      rerender(<GovernanceHomePage />);

      expect(document.activeElement).toBe(field);
    });

    it("does not take focus when a card opens where it already is", () => {
      showInbox([proposal("0.0.1", 1, "pending")]);
      searchParams.value = new URLSearchParams("schedule=0.0.1");

      render(<GovernanceHomePage />);

      expect(document.activeElement).toBe(document.body);
    });
  });
});
