import { WithdrawCancelActions } from "./WithdrawCancelActions";
import type { Proposal } from "@sh/core/governance/proposals";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccount } from "~~/hooks/mirror/useAccount";
import { useProposals } from "~~/hooks/mirror/useProposals";
import { type CancelFlowStep, useCancelProposalFlow } from "~~/hooks/useCancelProposalFlow";
import { useWithdrawProposal } from "~~/hooks/useWithdrawProposal";

vi.mock("~~/hooks/mirror/useAccount", () => ({ useAccount: vi.fn() }));
vi.mock("~~/hooks/mirror/useProposals", () => ({ useProposals: vi.fn() }));
vi.mock("~~/hooks/useCancelProposalFlow", () => ({ useCancelProposalFlow: vi.fn() }));
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
    admin_key: { _type: "ED25519", key: "aa".repeat(32) },
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

let start: ReturnType<typeof vi.fn>;

function mockFlow(step: CancelFlowStep = "idle", error: unknown = null) {
  start = vi.fn();
  vi.mocked(useCancelProposalFlow).mockReturnValue({ step, start, error } as ReturnType<typeof useCancelProposalFlow>);
}

function mockMutations() {
  mockFlow();
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

const WITHDRAWN = { status: "deleted", signatureCount: 0, executedAt: null, expiresAt: null, isSettled: true } as const;

const renderActions = (proposal: Proposal, accountId: string | null = PROPOSER_ACCOUNT_ID) =>
  render(
    <WithdrawCancelActions
      proposal={proposal}
      accountId={accountId}
      executorContractId={EXECUTOR_CONTRACT_ID}
      governanceAccountId={GOVERNANCE_ACCOUNT_ID}
      network="testnet"
      onWithdrawn={vi.fn()}
      onCancelled={vi.fn()}
    />,
  );

const flowTarget = () => vi.mocked(useCancelProposalFlow).mock.lastCall?.[0];

describe("WithdrawCancelActions", () => {
  it("renders nothing once neither action applies", () => {
    const proposal = baseProposal({
      state: { status: "executed", signatureCount: 2, executedAt: new Date(), expiresAt: null, isSettled: true },
      operation: { kind: "treasuryTransfer", hbar: [], tokens: [] },
    });
    const { container } = renderActions(proposal);
    expect(container.textContent).toBe("");
  });

  it("offers Withdraw and Cancel side by side as two outlined cards while the schedule is live", () => {
    renderActions(baseProposal({ registry: cancellableEntry(PROPOSER_EVM) }));
    const withdraw = screen.getByRole("button", { name: "Withdraw my approval round" });
    expect(withdraw.className).toContain("btn-outline");
    expect(screen.getByText(/Deletes this schedule only. The proposal stays registered/)).toBeTruthy();
    const cancel = screen.getByRole("button", { name: "Cancel this proposal" });
    expect(cancel.className).toContain("btn-error");
    expect(screen.getByText(/The live schedule is deleted first/)).toBeTruthy();
    expect(flowTarget()).toMatchObject({ scheduleId: "0.0.777", plan: { registryProposalId: 7, withdrawFirst: true } });
  });

  it("spells out the two transactions before deleting the live schedule and cancelling", () => {
    renderActions(baseProposal({ registry: cancellableEntry(PROPOSER_EVM) }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel this proposal" }));

    expect(screen.getByText("Two transactions, in this order")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText(/can still reach 2 signatures later/)).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Delete schedule, then cancel" });
    expect(document.activeElement).toBe(confirm);
    fireEvent.click(confirm);
    expect(start).toHaveBeenCalledOnce();
  });

  it("lets a cancel be called off without sending anything, and hands focus back", () => {
    renderActions(baseProposal({ registry: cancellableEntry(PROPOSER_EVM) }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel this proposal" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel this proposal" }));
    expect(start).not.toHaveBeenCalled();
  });

  it("is the cancel alone, with a one-step confirmation, once no schedule is live", () => {
    renderActions(baseProposal({ state: WITHDRAWN, registry: cancellableEntry(PROPOSER_EVM) }));
    expect(screen.queryByRole("button", { name: "Withdraw my approval round" })).toBeNull();
    expect(screen.getByText(/No schedule to delete, no signatures needed/)).toBeTruthy();
    expect(flowTarget()).toMatchObject({ plan: { withdrawFirst: false } });

    fireEvent.click(screen.getByRole("button", { name: "Cancel this proposal" }));
    expect(screen.getByText("Cancel this proposal for good?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancel" }));
    expect(start).toHaveBeenCalledOnce();
    // Both accounts are read on the configured network, never on the build's default one.
    expect(useAccount).toHaveBeenCalledWith(PROPOSER_ACCOUNT_ID, expect.objectContaining({ network: "testnet" }));
    expect(useAccount).toHaveBeenCalledWith(GOVERNANCE_ACCOUNT_ID, expect.objectContaining({ network: "testnet" }));
  });

  it("says which wallet step is under way", () => {
    mockFlow("cancelling");
    renderActions(baseProposal({ registry: cancellableEntry(PROPOSER_EVM) }));
    expect(screen.getByRole("status").textContent).toBe("Step 2 of 2 — approve the cancel in your wallet.");
    expect(screen.queryByRole("button", { name: "Withdraw my approval round" })).toBeNull();
  });

  it("says the delete is being confirmed before the cancel is asked for", () => {
    mockFlow("confirmingWithdraw");
    renderActions(baseProposal({ registry: cancellableEntry(PROPOSER_EVM) }));
    expect(screen.getByRole("status").textContent).toBe(
      "Step 1 of 2 — confirming the delete on the network before asking for the cancel…",
    );
  });

  it("says the schedule is withdrawn but the entry is not cancelled after step 2 failed, and offers the cancel alone", () => {
    mockFlow("withdrawnNotCancelled", Object.assign(new Error("User rejected"), { code: 5000 }));
    renderActions(baseProposal({ registry: cancellableEntry(PROPOSER_EVM) }));
    expect(screen.getByText(/The schedule was withdrawn, but the registry entry is not cancelled yet/)).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Withdraw my approval round" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel the registry entry" }));
    expect(start).toHaveBeenCalledOnce();
  });

  it("says why, instead of showing a button, to an account the contract would refuse", () => {
    mockAccounts("0x00000000000000000000000000000000000000ff", GOVERNANCE_EVM);
    renderActions(baseProposal({ state: WITHDRAWN, registry: cancellableEntry(PROPOSER_EVM) }), "0.0.9999");
    expect(screen.queryByRole("button", { name: "Cancel this proposal" })).toBeNull();
    expect(screen.getByText(/Only the account that registered this entry/)).toBeTruthy();
  });

  it("authorizes the governance account too, the only EXECUTOR_ROLE holder here", () => {
    mockAccounts(GOVERNANCE_EVM, GOVERNANCE_EVM);
    renderActions(baseProposal({ state: WITHDRAWN, registry: cancellableEntry(PROPOSER_EVM) }), GOVERNANCE_ACCOUNT_ID);
    expect(screen.getByRole("button", { name: "Cancel this proposal" })).toBeTruthy();
  });

  it("keeps a live round's Cancel card away from an account that could never cancel it", () => {
    mockAccounts(undefined, GOVERNANCE_EVM);
    const { container } = renderActions(baseProposal({ registry: cancellableEntry(PROPOSER_EVM) }), null);
    expect(container.textContent).toBe("");
  });

  it("tells an account that may cancel, but cannot delete the live schedule, to wait for the round to end", () => {
    const proposal = baseProposal({
      schedule: schedule({ creator_account_id: "0.0.4999" }),
      registry: cancellableEntry(PROPOSER_EVM),
    });
    renderActions(proposal);
    expect(screen.queryByRole("button", { name: "Cancel this proposal" })).toBeNull();
    expect(screen.getByText(/Only the account that created this schedule can delete it/)).toBeTruthy();
  });

  /**
   * Withdrawing one round does not free the entry when another schedule of `execute(id)` is still
   * open: cancelling under it would leave it to reach its threshold and revert at the treasury's cost.
   */
  it("holds Cancel back, pointing at it, while another schedule for the entry is still open", () => {
    const withdrawn = baseProposal({ state: WITHDRAWN, registry: cancellableEntry(PROPOSER_EVM) });
    const stillOpen = baseProposal({
      schedule: schedule({ schedule_id: "0.0.778" }),
      registry: cancellableEntry(PROPOSER_EVM),
    });
    mockInbox([withdrawn, stillOpen]);
    renderActions(withdrawn);
    expect(screen.queryByRole("button", { name: "Cancel this proposal" })).toBeNull();
    expect(screen.getByText(/Another schedule for this entry is still collecting signatures/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "0.0.778" }).getAttribute("href")).toBe("/governance/0.0.778");
  });

  it("says a native proposal has nothing to cancel: withdrawing ends it", () => {
    renderActions(baseProposal({ operation: { kind: "treasuryTransfer", hbar: [], tokens: [] } }));
    expect(screen.getByText(/A native operation has no registry entry, so this ends it/)).toBeTruthy();
    expect(screen.getByText(/No “cancel” here/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel this proposal" })).toBeNull();
  });
});
