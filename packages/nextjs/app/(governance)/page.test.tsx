import GovernanceHomePage from "./page";
import type { Proposal } from "@sh/core/governance/proposals";
import type { ScheduleStatus } from "@sh/core/mirror";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    inbox: { data: { proposals, unreachableProposers: [] } },
  } as unknown as ReturnType<typeof useProposals>);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  searchParams.value = new URLSearchParams();
});

describe("GovernanceHomePage", () => {
  it("lists only open approval rounds under Pending proposals, and the rest as settled", () => {
    showInbox([
      proposal("0.0.1", 1, "pending"),
      proposal("0.0.2", 2, "executed"),
      proposal("0.0.3", 3, "expired"),
      proposal("0.0.4", 4, "pending"),
    ]);
    searchParams.value = new URLSearchParams("schedule=0.0.1");

    render(<GovernanceHomePage />);

    expect(screen.getByRole("heading", { level: 1, name: INBOX_COPY.pendingHeading })).toBeTruthy();
    const settled = screen.getByRole("region", { name: INBOX_COPY.settledHeading });
    expect(within(settled).getAllByText(/Run entry/)).toHaveLength(2);

    const pendingDescriptions = screen.getAllByText(/Run entry/).filter(node => !settled.contains(node));
    expect(pendingDescriptions).toHaveLength(2);
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
        entry: { proposalId: 3, state: "cancelled", target: "0x0", proposer: "0x0", calldata: "0x", operation: {} },
      },
    } as unknown as Proposal;
    showInbox([proposal("0.0.1", 1, "pending"), withdrawnThenCancelled]);
    searchParams.value = new URLSearchParams("schedule=0.0.1");

    render(<GovernanceHomePage />);

    const settled = screen.getByRole("region", { name: INBOX_COPY.settledHeading });
    expect(within(settled).getByText("Withdrawn")).toBeTruthy();
    expect(within(settled).getByText("Registry entry: Cancelled")).toBeTruthy();
  });

  it("keeps showing the partial-inbox warning when a proposer could not be read", () => {
    vi.mocked(useProposals).mockReturnValue({
      inbox: { data: { proposals: [proposal("0.0.1", 1, "pending")], unreachableProposers: ["0.0.999"] } },
    } as unknown as ReturnType<typeof useProposals>);
    searchParams.value = new URLSearchParams("schedule=0.0.1");

    render(<GovernanceHomePage />);

    expect(screen.getByRole("status").textContent).toContain("0.0.999");
  });

  it("pre-selects the first pending proposal when the URL names none", () => {
    showInbox([proposal("0.0.1", 1, "pending"), proposal("0.0.4", 4, "pending")]);

    render(<GovernanceHomePage />);

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

  it("opens a schedule the inbox does not list right below the search", () => {
    showInbox([proposal("0.0.1", 1, "pending")]);
    searchParams.value = new URLSearchParams("schedule=0.0.99");

    render(<GovernanceHomePage />);

    const detail = screen.getByTestId("proposal-detail");
    expect(detail.textContent).toBe("Detail of 0.0.99 as inline");
    expect(screen.getByRole("search").compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { expanded: true })).toBeNull();
  });
});
