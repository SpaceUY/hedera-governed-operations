import GovernanceHomePage from "./page";
import type { Proposal } from "@sh/core/governance/proposals";
import type { ScheduleStatus } from "@sh/core/mirror";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProposals } from "~~/hooks/mirror/useProposals";
import { INBOX_COPY } from "~~/services/governance/proposalLabels";

vi.mock("~~/components/governance/GovernanceProvider", () => ({
  useGovernanceConfig: () => ({
    network: "testnet",
    governanceAccountId: "0.0.10671146",
    executor: { hederaContractId: "0.0.4242" },
  }),
}));
vi.mock("~~/hooks/mirror/useProposals", () => ({ useProposals: vi.fn() }));

/** A registry call whose entry id doubles as its name on screen: "Run entry N of the registry…". */
const proposal = (scheduleId: string, entry: number, status: ScheduleStatus) =>
  ({
    schedule: { schedule_id: scheduleId },
    state: { status, signatureCount: 2, executedAt: null, expiresAt: null, isSettled: status !== "pending" },
    execution: status === "executed" ? { status: "succeeded" } : { status: "notRun" },
    progress: { signed: status === "executed" ? 2 : 1, threshold: 2, signedBy: [] },
    incomingProgress: null,
    operation: { kind: "registryCall", proposalId: entry, executorContractId: "0.0.4242" },
    registry: { status: "notApplicable" },
  }) as unknown as Proposal;

const showInbox = (proposals: Proposal[]) =>
  vi.mocked(useProposals).mockReturnValue({
    inbox: { data: { proposals, unreachableProposers: [] } },
  } as unknown as ReturnType<typeof useProposals>);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GovernanceHomePage", () => {
  it("lists only open approval rounds under Pending proposals, and the rest as settled", () => {
    showInbox([
      proposal("0.0.1", 1, "pending"),
      proposal("0.0.2", 2, "executed"),
      proposal("0.0.3", 3, "expired"),
      proposal("0.0.4", 4, "pending"),
    ]);

    render(<GovernanceHomePage />);

    expect(screen.getByRole("heading", { level: 1, name: INBOX_COPY.pendingHeading })).toBeTruthy();
    const settled = screen.getByRole("region", { name: INBOX_COPY.settledHeading });
    const settledLinks = within(settled)
      .getAllByRole("link")
      .map(link => link.getAttribute("href"));
    expect(settledLinks).toEqual(["/governance/0.0.2", "/governance/0.0.3"]);

    const pendingLinks = screen
      .getAllByRole("link", { name: /Run entry/ })
      .filter(link => !settled.contains(link))
      .map(link => link.getAttribute("href"));
    expect(pendingLinks).toEqual(["/governance/0.0.1", "/governance/0.0.4"]);
  });

  it("says nothing is waiting when every proposal has settled", () => {
    showInbox([proposal("0.0.2", 2, "executed")]);

    render(<GovernanceHomePage />);

    expect(screen.getByText(INBOX_COPY.noPending)).toBeTruthy();
    expect(screen.getByRole("region", { name: INBOX_COPY.settledHeading })).toBeTruthy();
  });
});
