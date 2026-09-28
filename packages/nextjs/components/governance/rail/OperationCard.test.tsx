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
    registry: { status: "unreachable", reason: "relay down" },
    ...overrides,
  }) as unknown as Proposal;

const entry = (state: "pending" | "cancelled") =>
  ({
    status: "read",
    entry: {
      proposalId: 7,
      state,
      target: "0x3f806946439c3521eeD7d740c3f84E09888C0419",
      proposer: "0x0",
      calldata: "0x",
      operation: {
        kind: "upgrade",
        target: "0x3f806946439c3521eeD7d740c3f84E09888C0419",
        implementation: "0x0000000000000000000000000000000000a2d434",
        initializerCalldata: "0x",
        initializer: { kind: "none" },
      },
    },
  }) as Proposal["registry"];

const renderCard = (props: Partial<Parameters<typeof OperationCard>[0]> = {}) =>
  render(
    <ul>
      <OperationCard proposal={proposal()} selected={false} onSelect={vi.fn()} {...props} />
    </ul>,
  );

describe("OperationCard", () => {
  it("shows what it does, its family, and how many signatures it still needs", () => {
    renderCard();
    expect(screen.getByText(/Run entry 7 of the registry/)).toBeTruthy();
    expect(screen.getByText("contract · via registry")).toBeTruthy();
    expect(screen.getByText("1 more needed")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Created. 1 more signature needed. Not executed." })).toBeTruthy();
  });

  it("names a registry call by the operation its entry holds once the entry was read", () => {
    renderCard({ proposal: proposal({ registry: entry("pending") }) });
    expect(screen.getByText("Upgrade the vault to v2")).toBeTruthy();
  });

  it("marks a native kind as such", () => {
    renderCard({
      proposal: proposal({
        operation: { kind: "treasuryTransfer", hbar: [], tokens: [] },
        registry: { status: "notApplicable" },
      }),
    });
    expect(screen.getByText("Pay a supplier")).toBeTruthy();
    expect(screen.getByText("native · no registry")).toBeTruthy();
  });

  it("says how a settled proposal ended instead of what it needs", () => {
    renderCard({
      proposal: proposal({
        state: { status: "deleted", signatureCount: 1, executedAt: null, expiresAt: null, isSettled: true },
      }),
    });
    expect(screen.getByText("Withdrawn")).toBeTruthy();
    expect(screen.queryByText(/more needed/)).toBeNull();
  });

  it("reports the selection when the row is pressed", () => {
    const onSelect = vi.fn();
    renderCard({ onSelect });
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("shows the host's detail under the row only while it is selected", () => {
    const detail = <p>Proposal detail</p>;
    renderCard({ detail });
    expect(screen.queryByText("Proposal detail")).toBeNull();

    cleanup();
    renderCard({ selected: true, detail });
    expect(screen.getByText("Proposal detail")).toBeTruthy();
  });

  it("discloses the detail it opens: expanded, and controlling the region that holds it", () => {
    renderCard({ selected: true, detail: <p>Proposal detail</p> });
    const button = screen.getByRole("button", { expanded: true });
    const region = document.getElementById(button.getAttribute("aria-controls") ?? "");
    expect(region?.textContent).toBe("Proposal detail");
  });

  it("stays collapsed, controlling nothing, while it is not selected", () => {
    renderCard({ detail: <p>Proposal detail</p> });
    const button = screen.getByRole("button", { expanded: false });
    expect(button.hasAttribute("aria-controls")).toBe(false);
    expect(button.hasAttribute("aria-pressed")).toBe(false);
  });

  it("links to the proposal's own page without folding that into the selectable row", () => {
    renderCard();
    const link = screen.getByRole("link", { name: /View details/ });
    expect(link.getAttribute("href")).toBe("/governance/0.0.1");
  });

  it("drops the link to the full page once the row is open, since the detail is already showing", () => {
    renderCard({ selected: true, detail: <p>Proposal detail</p> });
    expect(screen.queryByRole("link", { name: /View details/ })).toBeNull();
  });

  it("shows an unrecognized scheduled body with its reason, styled as a warning", () => {
    renderCard({ proposal: proposal({ operation: { kind: "unrecognized", reason: "an unsupported field is set" } }) });
    const description = screen.getByText(/Not a proposal this template recognises: an unsupported field is set/);
    expect(description.className).toContain("text-warning");
  });

  it("reads a cancelled registry entry as cancelled even while the schedule itself still looks open", () => {
    renderCard({ proposal: proposal({ registry: entry("cancelled") }) });
    expect(screen.getByText("1 more needed · entry cancelled")).toBeTruthy();
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
    expect(screen.getByText(/left$/).className).toContain("badge-warning");
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
    expect(screen.queryByText(/left$/)).toBeNull();
  });
});
