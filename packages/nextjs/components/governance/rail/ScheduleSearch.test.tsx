import { ScheduleSearch } from "./ScheduleSearch";
import type { Proposal } from "@sh/core/governance/proposals";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProposalLookup } from "~~/hooks/mirror/useProposalLookup";

vi.mock("~~/hooks/mirror/useProposalLookup", () => ({ useProposalLookup: vi.fn() }));

const found = (scheduleId: string): Proposal =>
  ({
    schedule: { schedule_id: scheduleId },
    state: { status: "pending", signatureCount: 1, executedAt: null, expiresAt: null, isSettled: false },
    execution: { status: "notRun" },
    progress: { signed: 1, threshold: 2, signedBy: [] },
    incomingProgress: null,
    operation: { kind: "treasuryTransfer", hbar: [], tokens: [] },
    registry: { status: "notApplicable" },
  }) as unknown as Proposal;

type SearchProps = Parameters<typeof ScheduleSearch>[0];

const searchProps = (overrides: Partial<SearchProps> = {}): SearchProps => ({
  governanceAccountId: "0.0.9",
  executorContractId: "0.0.4242",
  network: "testnet",
  selectedScheduleId: null,
  onSelect: vi.fn(),
  onToggle: vi.fn(),
  unlistedSelectionId: null,
  selectedDetail: null,
  knownScheduleIds: new Set(),
  ...overrides,
});

const renderSearch = (onSelect = vi.fn()) => {
  render(<ScheduleSearch {...searchProps({ onSelect })} />);
  return onSelect;
};

const lookupFinds = (scheduleId: string) =>
  vi.mocked(useProposalLookup).mockReturnValue({
    proposal: found(scheduleId),
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof useProposalLookup>);

const search = (value: string) => {
  fireEvent.change(screen.getByLabelText(/Find a proposal/), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Find" }));
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ScheduleSearch", () => {
  it("rejects a term that is not a schedule id without reading Mirror", () => {
    renderSearch();
    search("not-an-id");
    expect(screen.getByRole("alert").textContent).toContain("doesn't look like a schedule id");
    expect(useProposalLookup).not.toHaveBeenCalled();
  });

  it("does not query Mirror before a search is submitted", () => {
    renderSearch();
    expect(useProposalLookup).not.toHaveBeenCalled();
  });

  it("selects the schedule it found and shows it as a card", () => {
    lookupFinds("0.0.777");
    const onSelect = renderSearch();
    search("0.0.777");
    expect(onSelect).toHaveBeenCalledWith("0.0.777");
    expect(screen.getByText("Pay a supplier")).toBeTruthy();
  });

  it("says plainly when nothing was found", () => {
    vi.mocked(useProposalLookup).mockReturnValue({
      proposal: undefined,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    } as unknown as ReturnType<typeof useProposalLookup>);
    renderSearch();
    search("0.0.404");
    expect(screen.getByText("No proposal found for 0.0.404.")).toBeTruthy();
  });

  it("shows the lookup's own error", () => {
    vi.mocked(useProposalLookup).mockReturnValue({
      proposal: undefined,
      isLoading: false,
      error: new Error("not paid by the governance account"),
      refresh: vi.fn(),
    } as unknown as ReturnType<typeof useProposalLookup>);
    renderSearch();
    search("0.0.500");
    expect(screen.getByRole("alert").textContent).toBe("not paid by the governance account");
  });

  it("draws no duplicate card for a schedule the inbox already lists", () => {
    render(<ScheduleSearch {...searchProps({ knownScheduleIds: new Set(["0.0.1"]) })} />);
    search("0.0.1");
    expect(useProposalLookup).not.toHaveBeenCalled();
  });

  it("opens and closes its result like any other card, instead of only selecting it", () => {
    lookupFinds("0.0.777");
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    render(<ScheduleSearch {...searchProps({ onSelect, onToggle })} />);
    search("0.0.777");
    onSelect.mockClear();

    fireEvent.click(screen.getByRole("button", { expanded: false }));

    expect(onToggle).toHaveBeenCalledWith("0.0.777");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("drops its result once another card is selected, so its lookup stops polling", () => {
    lookupFinds("0.0.777");
    const { rerender } = render(<ScheduleSearch {...searchProps({ selectedScheduleId: null })} />);
    search("0.0.777");
    rerender(<ScheduleSearch {...searchProps({ selectedScheduleId: "0.0.777" })} />);
    expect(screen.getByRole("button", { expanded: false })).toBeTruthy();

    // Closing the result keeps it on screen; selecting an inbox card drops it.
    rerender(<ScheduleSearch {...searchProps({ selectedScheduleId: null })} />);
    expect(screen.getByRole("button", { expanded: false })).toBeTruthy();
    rerender(<ScheduleSearch {...searchProps({ selectedScheduleId: "0.0.1" })} />);
    expect(screen.queryByRole("button", { expanded: false })).toBeNull();

    vi.mocked(useProposalLookup).mockClear();
    rerender(<ScheduleSearch {...searchProps({ selectedScheduleId: "0.0.1" })} />);
    expect(useProposalLookup).not.toHaveBeenCalled();
  });

  it("shows a selection the inbox does not list as its result, with the field filled in and the detail under it", () => {
    lookupFinds("0.0.99");
    render(
      <ScheduleSearch
        {...searchProps({
          selectedScheduleId: "0.0.99",
          unlistedSelectionId: "0.0.99",
          selectedDetail: <button type="button">Sign</button>,
        })}
      />,
    );

    expect((screen.getByLabelText(/Find a proposal/) as HTMLInputElement).value).toBe("0.0.99");
    const card = screen.getByRole("button", { expanded: true });
    const detail = document.getElementById(card.getAttribute("aria-controls") ?? "");
    expect(detail?.textContent).toBe("Sign");
    // The detail's own buttons must not submit the search.
    expect(detail?.closest("form")).toBeNull();
    expect(screen.getByRole("search").contains(detail)).toBe(true);
  });
});
