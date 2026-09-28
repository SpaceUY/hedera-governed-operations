import { PendingOperationsList } from "./PendingOperationsList";
import { COLLAPSED_VISIBLE_COUNT } from "./pendingCollapse";
import type { Proposal } from "@sh/core/governance/proposals";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

const proposal = (n: number): Proposal =>
  ({
    schedule: { schedule_id: `0.0.${n}` },
    state: { status: "pending", signatureCount: 1, executedAt: null, expiresAt: null, isSettled: false },
    execution: { status: "notRun" },
    progress: { signed: 1, threshold: 2, signedBy: [] },
    incomingProgress: null,
    operation: {
      kind: "registryCall",
      proposalId: n,
      executorContractId: "0.0.4242",
      gas: 90_000,
      payableTinybars: 0n,
    },
    registry: { status: "notRead" },
  }) as unknown as Proposal;

const proposals = (count: number): Proposal[] => Array.from({ length: count }, (_unused, index) => proposal(index + 1));

describe("PendingOperationsList", () => {
  it("shows only the first few and a show-more control for the rest", () => {
    render(<PendingOperationsList proposals={proposals(5)} selectedScheduleId={null} onSelect={vi.fn()} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(COLLAPSED_VISIBLE_COUNT);
    expect(screen.getByRole("button", { name: "Show 2 more" })).toBeTruthy();
  });

  it("expands to show every row on request", () => {
    render(<PendingOperationsList proposals={proposals(5)} selectedScheduleId={null} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Show 2 more" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeTruthy();
  });

  it("opens the list on its own when the selected row sits past the fold", () => {
    render(<PendingOperationsList proposals={proposals(5)} selectedScheduleId="0.0.5" onSelect={vi.fn()} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("reports the schedule id of the row that was clicked", () => {
    const onSelect = vi.fn();
    render(<PendingOperationsList proposals={proposals(2)} selectedScheduleId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getAllByRole("button", { expanded: false })[1]);
    expect(onSelect).toHaveBeenCalledWith("0.0.2");
  });

  it("shows no show-more control when everything already fits", () => {
    render(<PendingOperationsList proposals={proposals(2)} selectedScheduleId={null} onSelect={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Show \d+ more/ })).toBeNull();
  });
});
