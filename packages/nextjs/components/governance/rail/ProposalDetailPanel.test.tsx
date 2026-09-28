import { ProposalDetailPanel } from "./ProposalDetailPanel";
import type { Proposal } from "@sh/core/governance/proposals";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccount } from "~~/hooks/mirror/useAccount";
import { useCouncil } from "~~/hooks/mirror/useCouncil";
import { useProposals } from "~~/hooks/mirror/useProposals";
import { useCancelProposal } from "~~/hooks/useCancelProposal";
import { useSignProposal } from "~~/hooks/useSignProposal";
import { useWithdrawProposal } from "~~/hooks/useWithdrawProposal";

vi.mock("~~/hooks/mirror/useCouncil", () => ({ useCouncil: vi.fn() }));
vi.mock("~~/hooks/mirror/useAccount", () => ({ useAccount: vi.fn() }));
vi.mock("~~/hooks/mirror/useProposals", () => ({ useProposals: vi.fn() }));
vi.mock("~~/hooks/useSignProposal", () => ({ useSignProposal: vi.fn() }));
vi.mock("~~/hooks/useCancelProposal", () => ({ useCancelProposal: vi.fn() }));
vi.mock("~~/hooks/useWithdrawProposal", () => ({ useWithdrawProposal: vi.fn() }));

const GOVERNANCE_ACCOUNT_ID = "0.0.4000";
const EXECUTOR_CONTRACT_ID = "0.0.5000";
const MEMBER_A = "0.0.4101";

const COUNCIL_KEY = { threshold: 2, memberKeys: ["key-a", "key-b"] };
const PROPOSERS = [{ accountId: MEMBER_A, key: "key-a" }];

const schedule = (overrides: Partial<Proposal["schedule"]> = {}) =>
  ({
    schedule_id: "0.0.777",
    creator_account_id: MEMBER_A,
    payer_account_id: GOVERNANCE_ACCOUNT_ID,
    consensus_timestamp: "0",
    executed_timestamp: null,
    expiration_time: null,
    deleted: false,
    memo: "",
    wait_for_expiry: false,
    admin_key: null,
    signatures: [],
    transaction_body: "",
    ...overrides,
  }) as Proposal["schedule"];

const baseProposal = (overrides: Partial<Proposal> = {}): Proposal =>
  ({
    schedule: schedule(),
    state: { status: "pending", signatureCount: 1, executedAt: null, expiresAt: null, isSettled: false },
    execution: { status: "notRun" },
    progress: { signed: 1, threshold: 2, signedBy: ["key-a"] },
    incomingProgress: null,
    operation: { kind: "treasuryTransfer", hbar: [], tokens: [] },
    registry: { status: "notApplicable" },
    ...overrides,
  }) as Proposal;

function mockHooks() {
  vi.mocked(useCouncil).mockReturnValue({
    data: { key: COUNCIL_KEY, proposers: PROPOSERS, proposerAccountIds: [], unresolvableProposers: [] },
    isLoading: false,
  } as unknown as ReturnType<typeof useCouncil>);
  vi.mocked(useSignProposal).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useSignProposal>);
  vi.mocked(useCancelProposal).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useCancelProposal>);
  vi.mocked(useWithdrawProposal).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useWithdrawProposal>);
  vi.mocked(useAccount).mockReturnValue({ data: undefined, isLoading: false } as unknown as ReturnType<
    typeof useAccount
  >);
  vi.mocked(useProposals).mockReturnValue({
    inbox: { data: undefined, isLoading: false },
  } as unknown as ReturnType<typeof useProposals>);
}

beforeEach(mockHooks);
afterEach(cleanup);

describe("ProposalDetailPanel", () => {
  it("shows the status, registry and approvals summary, and one row per council seat", () => {
    render(
      <ProposalDetailPanel
        proposal={baseProposal()}
        accountId={MEMBER_A}
        governanceAccountId={GOVERNANCE_ACCOUNT_ID}
        executorContractId={EXECUTOR_CONTRACT_ID}
        network="testnet"
        refresh={vi.fn()}
        markRegistryEntryCancelled={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Proposal 0.0.777" })).toBeTruthy();
    expect(screen.getByText("Collecting signatures")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Approvals" })).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
  });

  it("offers Sign while the proposal can be signed", () => {
    const sign = vi.fn();
    vi.mocked(useSignProposal).mockReturnValue({ mutate: sign, isPending: false, error: null } as unknown as ReturnType<
      typeof useSignProposal
    >);
    render(
      <ProposalDetailPanel
        proposal={baseProposal()}
        accountId={MEMBER_A}
        governanceAccountId={GOVERNANCE_ACCOUNT_ID}
        executorContractId={EXECUTOR_CONTRACT_ID}
        network="testnet"
        refresh={vi.fn()}
        markRegistryEntryCancelled={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign" }));
    expect(sign).toHaveBeenCalledWith("0.0.777", expect.anything());
  });

  it("renders both councils for a rotation, each against its own threshold", () => {
    const incomingCouncil = { threshold: 2, memberKeys: ["key-x", "key-y"] };
    render(
      <ProposalDetailPanel
        proposal={baseProposal({
          operation: { kind: "councilRotation", accountId: GOVERNANCE_ACCOUNT_ID, council: incomingCouncil },
          incomingProgress: { signed: 0, threshold: 2, signedBy: [] },
        })}
        accountId={null}
        governanceAccountId={GOVERNANCE_ACCOUNT_ID}
        executorContractId={EXECUTOR_CONTRACT_ID}
        network="testnet"
        refresh={vi.fn()}
        markRegistryEntryCancelled={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Current council" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Incoming council" })).toBeTruthy();
    expect(screen.getByText(/Replacing the council needs signatures from both sides/)).toBeTruthy();
  });

  it("says there is no reject control and what expiry does", () => {
    render(
      <ProposalDetailPanel
        proposal={baseProposal({
          state: {
            status: "pending",
            signatureCount: 1,
            executedAt: null,
            expiresAt: new Date(2030, 0, 1),
            isSettled: false,
          },
        })}
        accountId={MEMBER_A}
        governanceAccountId={GOVERNANCE_ACCOUNT_ID}
        executorContractId={EXECUTOR_CONTRACT_ID}
        network="testnet"
        refresh={vi.fn()}
        markRegistryEntryCancelled={vi.fn()}
      />,
    );
    expect(screen.getByText(/There is no execute button and no reject/)).toBeTruthy();
    expect(screen.getByText(/the proposal expires/)).toBeTruthy();
  });
});
