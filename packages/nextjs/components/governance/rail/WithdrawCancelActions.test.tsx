import { WithdrawCancelActions } from "./WithdrawCancelActions";
import type { Proposal } from "@sh/core/governance/proposals";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccount } from "~~/hooks/mirror/useAccount";
import { useProposals } from "~~/hooks/mirror/useProposals";
import { useCancelProposal } from "~~/hooks/useCancelProposal";
import { useWithdrawProposal } from "~~/hooks/useWithdrawProposal";

vi.mock("~~/hooks/mirror/useAccount", () => ({ useAccount: vi.fn() }));
vi.mock("~~/hooks/mirror/useProposals", () => ({ useProposals: vi.fn() }));
vi.mock("~~/hooks/useCancelProposal", () => ({ useCancelProposal: vi.fn() }));
vi.mock("~~/hooks/useWithdrawProposal", () => ({ useWithdrawProposal: vi.fn() }));

const EXECUTOR_CONTRACT_ID = "0.0.5000";
const GOVERNANCE_ACCOUNT_ID = "0.0.4000";
const PROPOSER_ACCOUNT_ID = "0.0.4101";
const PROPOSER_EVM = "0xf2b17e6774b48f1073a94b78791aaa02698d1620";
const GOVERNANCE_EVM = "0x0000000000000000000000000000000000000fa0";

const schedule = (overrides: Partial<Proposal["schedule"]> = {}) =>
  ({
    schedule_id: "0.0.777",
    creator_account_id: PROPOSER_ACCOUNT_ID,
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

const REGISTRY_CALL = {
  kind: "registryCall",
  executorContractId: EXECUTOR_CONTRACT_ID,
  proposalId: 7,
  gas: 90_000,
  payableTinybars: 0n,
} as const;

const baseProposal = (overrides: Partial<Proposal> = {}): Proposal =>
  ({
    schedule: schedule(),
    state: { status: "pending", signatureCount: 1, executedAt: null, expiresAt: null, isSettled: false },
    execution: { status: "notRun" },
    progress: { signed: 1, threshold: 2, signedBy: [] },
    incomingProgress: null,
    operation: REGISTRY_CALL,
    registry: { status: "notApplicable" },
    ...overrides,
  }) as Proposal;

const cancellableEntry = (proposer: string) =>
  ({
    status: "read",
    entry: {
      proposalId: 7,
      state: "pending",
      target: "0x3f806946439c3521eeD7d740c3f84E09888C0419",
      proposer,
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

function mockMutations() {
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
}

function mockInbox(proposals: Proposal[]) {
  vi.mocked(useProposals).mockReturnValue({
    inbox: { data: { proposals, unreachableProposers: [] }, isLoading: false },
  } as unknown as ReturnType<typeof useProposals>);
}

function mockAccounts(accountEvm: string | undefined, governanceEvm: string | undefined) {
  vi.mocked(useAccount).mockImplementation(
    id =>
      ({
        data: id === GOVERNANCE_ACCOUNT_ID ? { evm_address: governanceEvm } : { evm_address: accountEvm },
        isLoading: false,
      }) as unknown as ReturnType<typeof useAccount>,
  );
}

beforeEach(() => {
  mockMutations();
  mockAccounts(PROPOSER_EVM, GOVERNANCE_EVM);
  mockInbox([]);
});

afterEach(cleanup);

describe("WithdrawCancelActions", () => {
  it("renders nothing once neither action applies", () => {
    const proposal = baseProposal({
      state: { status: "executed", signatureCount: 2, executedAt: new Date(), expiresAt: null, isSettled: true },
      operation: { kind: "treasuryTransfer", hbar: [], tokens: [] },
    });
    const { container } = render(
      <WithdrawCancelActions
        proposal={proposal}
        accountId={PROPOSER_ACCOUNT_ID}
        executorContractId={EXECUTOR_CONTRACT_ID}
        governanceAccountId={GOVERNANCE_ACCOUNT_ID}
        network="testnet"
        onWithdrawn={vi.fn()}
        onCancelled={vi.fn()}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("offers Withdraw to the proposer of a pending proposal, and explains the withdraw-then-cancel order", () => {
    const proposal = baseProposal();
    render(
      <WithdrawCancelActions
        proposal={proposal}
        accountId={PROPOSER_ACCOUNT_ID}
        executorContractId={EXECUTOR_CONTRACT_ID}
        governanceAccountId={GOVERNANCE_ACCOUNT_ID}
        network="testnet"
        onWithdrawn={vi.fn()}
        onCancelled={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Withdraw my approval round" })).toBeTruthy();
    expect(screen.getByText(/becomes available once no schedule is still open/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel this proposal" })).toBeNull();
  });

  it("offers Cancel, with confirmation, to the entry's own proposer", () => {
    const onCancelled = vi.fn();
    const cancelMutate = vi.fn((_input, options?: { onSuccess?: () => void }) => options?.onSuccess?.());
    vi.mocked(useCancelProposal).mockReturnValue({
      mutate: cancelMutate,
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof useCancelProposal>);

    const proposal = baseProposal({
      state: { status: "deleted", signatureCount: 0, executedAt: null, expiresAt: null, isSettled: true },
      registry: cancellableEntry(PROPOSER_EVM),
    });
    render(
      <WithdrawCancelActions
        proposal={proposal}
        accountId={PROPOSER_ACCOUNT_ID}
        executorContractId={EXECUTOR_CONTRACT_ID}
        governanceAccountId={GOVERNANCE_ACCOUNT_ID}
        network="testnet"
        onWithdrawn={vi.fn()}
        onCancelled={onCancelled}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel this proposal" }));
    expect(screen.getByText("Cancel this proposal for good?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Confirm cancel" }));
    expect(cancelMutate).toHaveBeenCalledWith(
      { executorContractId: EXECUTOR_CONTRACT_ID, registryProposalId: 7 },
      expect.anything(),
    );
    expect(onCancelled).toHaveBeenCalled();
    // Both accounts are read on the configured network, never on the build's default one.
    expect(useAccount).toHaveBeenCalledWith(PROPOSER_ACCOUNT_ID, expect.objectContaining({ network: "testnet" }));
    expect(useAccount).toHaveBeenCalledWith(GOVERNANCE_ACCOUNT_ID, expect.objectContaining({ network: "testnet" }));
  });

  it("lets a cancel be called off without sending anything", () => {
    const cancelMutate = vi.fn();
    vi.mocked(useCancelProposal).mockReturnValue({
      mutate: cancelMutate,
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof useCancelProposal>);

    const proposal = baseProposal({
      state: { status: "deleted", signatureCount: 0, executedAt: null, expiresAt: null, isSettled: true },
      registry: cancellableEntry(PROPOSER_EVM),
    });
    render(
      <WithdrawCancelActions
        proposal={proposal}
        accountId={PROPOSER_ACCOUNT_ID}
        executorContractId={EXECUTOR_CONTRACT_ID}
        governanceAccountId={GOVERNANCE_ACCOUNT_ID}
        network="testnet"
        onWithdrawn={vi.fn()}
        onCancelled={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel this proposal" }));
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }));
    expect(screen.getByRole("button", { name: "Cancel this proposal" })).toBeTruthy();
    expect(cancelMutate).not.toHaveBeenCalled();
  });

  it("says why, instead of showing a button, to an account the contract would refuse", () => {
    mockAccounts("0x00000000000000000000000000000000000000ff", GOVERNANCE_EVM);
    const proposal = baseProposal({
      state: { status: "deleted", signatureCount: 0, executedAt: null, expiresAt: null, isSettled: true },
      registry: cancellableEntry(PROPOSER_EVM),
    });
    render(
      <WithdrawCancelActions
        proposal={proposal}
        accountId="0.0.9999"
        executorContractId={EXECUTOR_CONTRACT_ID}
        governanceAccountId={GOVERNANCE_ACCOUNT_ID}
        network="testnet"
        onWithdrawn={vi.fn()}
        onCancelled={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Cancel this proposal" })).toBeNull();
    expect(screen.getByText(/Only the account that registered this entry/)).toBeTruthy();
  });

  it("authorizes the governance account too, the only EXECUTOR_ROLE holder here", () => {
    mockAccounts(GOVERNANCE_EVM, GOVERNANCE_EVM);
    const proposal = baseProposal({
      state: { status: "deleted", signatureCount: 0, executedAt: null, expiresAt: null, isSettled: true },
      registry: cancellableEntry(PROPOSER_EVM),
    });
    render(
      <WithdrawCancelActions
        proposal={proposal}
        accountId={GOVERNANCE_ACCOUNT_ID}
        executorContractId={EXECUTOR_CONTRACT_ID}
        governanceAccountId={GOVERNANCE_ACCOUNT_ID}
        network="testnet"
        onWithdrawn={vi.fn()}
        onCancelled={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Cancel this proposal" })).toBeTruthy();
  });

  /**
   * Withdrawing one round does not free the entry when another schedule of `execute(id)` is still
   * open: cancelling under it would leave it to reach its threshold and revert at the treasury's cost.
   */
  it("holds Cancel back, pointing at it, while another schedule for the entry is still open", () => {
    const withdrawn = baseProposal({
      state: { status: "deleted", signatureCount: 0, executedAt: null, expiresAt: null, isSettled: true },
      registry: cancellableEntry(PROPOSER_EVM),
    });
    const stillOpen = baseProposal({
      schedule: schedule({ schedule_id: "0.0.778" }),
      registry: cancellableEntry(PROPOSER_EVM),
    });
    mockInbox([withdrawn, stillOpen]);
    render(
      <WithdrawCancelActions
        proposal={withdrawn}
        accountId={PROPOSER_ACCOUNT_ID}
        executorContractId={EXECUTOR_CONTRACT_ID}
        governanceAccountId={GOVERNANCE_ACCOUNT_ID}
        network="testnet"
        onWithdrawn={vi.fn()}
        onCancelled={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Cancel this proposal" })).toBeNull();
    expect(screen.getByText(/Another schedule for this entry is still collecting signatures/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "0.0.778" }).getAttribute("href")).toBe("/governance/0.0.778");
  });
});
