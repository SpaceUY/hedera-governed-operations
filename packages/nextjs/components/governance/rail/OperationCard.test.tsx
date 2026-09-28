import { OperationCard } from "./OperationCard";
import type { Proposal } from "@sh/core/governance/proposals";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

const BASE_PROGRESS = { signed: 1, threshold: 2, signedBy: [] };

const proposal = (overrides: Partial<Proposal> = {}): Proposal =>
  ({
    schedule: { schedule_id: "0.0.1" },
    state: { status: "pending", signatureCount: 1, executedAt: null, expiresAt: null, isSettled: false },
    execution: { status: "notRun" },
    progress: BASE_PROGRESS,
    incomingProgress: null,
    operation: {
      kind: "registryCall",
      proposalId: 7,
      executorContractId: "0.0.4242",
      gas: 90_000,
      payableTinybars: 0n,
    },
    registry: { status: "notRead" },
    ...overrides,
  }) as unknown as Proposal;

const renderCard = (props: Partial<Parameters<typeof OperationCard>[0]> = {}) =>
  render(
    <ul>
      <OperationCard proposal={proposal()} selected={false} onSelect={vi.fn()} {...props} />
    </ul>,
  );

describe("OperationCard", () => {
  it("shows what it does, its status and its approvals", () => {
    renderCard();
    expect(screen.getByText(/Run entry 7 of the registry/)).toBeTruthy();
    expect(screen.getByText("Collecting signatures")).toBeTruthy();
    expect(screen.getByText("1 of 2 required signatures")).toBeTruthy();
  });

  it("reports the selection and marks the row pressed", () => {
    const onSelect = vi.fn();
    renderCard({ onSelect });
    fireEvent.click(screen.getByRole("button", { pressed: false }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("marks a selected row as pressed", () => {
    renderCard({ selected: true });
    expect(screen.getByRole("button", { pressed: true })).toBeTruthy();
  });

  it("links to the proposal's own page without folding that into the selectable row", () => {
    renderCard();
    const link = screen.getByRole("link", { name: /View details/ });
    expect(link.getAttribute("href")).toBe("/governance/0.0.1");
  });

  it("shows an unrecognized scheduled body with its reason, styled as a warning", () => {
    renderCard({ proposal: proposal({ operation: { kind: "unrecognized", reason: "an unsupported field is set" } }) });
    const description = screen.getByText(/Not a proposal this template recognises: an unsupported field is set/);
    expect(description.className).toContain("text-warning");
  });

  it("reads a cancelled registry entry as Cancelled even while the schedule itself still looks open", () => {
    renderCard({
      proposal: proposal({
        registry: {
          status: "read",
          entry: {
            proposalId: 7,
            state: "cancelled",
            target: "0x0",
            proposer: "0x0",
            calldata: "0x",
            operation: {} as never,
          },
        },
      }),
    });
    expect(screen.getByText("Registry entry: Cancelled")).toBeTruthy();
  });

  it("intensifies the countdown inside the final hour", () => {
    renderCard({
      proposal: proposal({
        state: {
          status: "pending",
          signatureCount: 1,
          executedAt: null,
          isSettled: false,
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
      }),
    });
    expect(screen.getByText(/Expires in/).className).toContain("text-error");
  });

  it("shows no countdown once the proposal has settled", () => {
    renderCard({
      proposal: proposal({
        state: {
          status: "executed",
          signatureCount: 2,
          executedAt: new Date(),
          isSettled: true,
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
        execution: { status: "succeeded" } as unknown as Proposal["execution"],
      }),
    });
    expect(screen.queryByText(/Expires in/)).toBeNull();
  });
});
