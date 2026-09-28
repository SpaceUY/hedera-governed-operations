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

const renderSearch = (onSelect = vi.fn()) => {
  render(
    <ScheduleSearch
      governanceAccountId="0.0.9"
      executorContractId="0.0.4242"
      network="testnet"
      selectedScheduleId={null}
      onSelect={onSelect}
      knownScheduleIds={new Set()}
    />,
  );
  return onSelect;
};

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
    vi.mocked(useProposalLookup).mockReturnValue({
      proposal: found("0.0.777"),
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    } as unknown as ReturnType<typeof useProposalLookup>);
    const onSelect = renderSearch();
    search("0.0.777");
    expect(onSelect).toHaveBeenCalledWith("0.0.777");
    expect(screen.getByText(/Transfer/)).toBeTruthy();
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
    render(
      <ScheduleSearch
        governanceAccountId="0.0.9"
        executorContractId="0.0.4242"
        network="testnet"
        selectedScheduleId={null}
        onSelect={vi.fn()}
        knownScheduleIds={new Set(["0.0.1"])}
      />,
    );
    search("0.0.1");
    expect(useProposalLookup).not.toHaveBeenCalled();
  });
});
