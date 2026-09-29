import { ProposalDetailPanel } from "./ProposalDetailPanel";
import type { Proposal } from "@sh/core/governance/proposals";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccount } from "~~/hooks/mirror/useAccount";
import { useCouncil } from "~~/hooks/mirror/useCouncil";
import { useProposals } from "~~/hooks/mirror/useProposals";
import { useSignProposal } from "~~/hooks/useSignProposal";
import { useWithdrawProposal } from "~~/hooks/useWithdrawProposal";
import { LIVE_MAP_STATUS_NOTE, UNREACHABLE_REGISTRY_SIGN_WARNING } from "~~/services/governance/proposalLabels";

vi.mock("~~/hooks/mirror/useCouncil", () => ({ useCouncil: vi.fn() }));
vi.mock("~~/hooks/mirror/useAccount", () => ({ useAccount: vi.fn() }));
vi.mock("~~/hooks/mirror/useProposals", () => ({ useProposals: vi.fn() }));
vi.mock("~~/hooks/useSignProposal", () => ({ useSignProposal: vi.fn() }));
vi.mock("~~/hooks/useCancelProposalFlow", () => ({
  useCancelProposalFlow: () => ({ step: "idle", start: vi.fn(), error: null }),
}));
vi.mock("~~/hooks/useWithdrawProposal", () => ({ useWithdrawProposal: vi.fn() }));

const GOVERNANCE_ACCOUNT_ID = "0.0.4000";
const EXECUTOR_CONTRACT_ID = "0.0.5000";
const MEMBER_A = "0.0.4101";
const MEMBER_B = "0.0.4102";

/** Seats in base64, the form Mirror writes a signature's key in, so signature rows can match them. */
const KEY_A = btoa("key-a");
const KEY_B = btoa("key-b");
const KEY_X = btoa("key-x");
const KEY_Y = btoa("key-y");

const COUNCIL_KEY = { threshold: 2, memberKeys: [KEY_A, KEY_B] };
const PROPOSERS = [
  { accountId: MEMBER_A, key: KEY_A },
  { accountId: MEMBER_B, key: KEY_B },
];

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
    progress: { signed: 1, threshold: 2, signedBy: [KEY_A] },
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

type PanelProps = Parameters<typeof ProposalDetailPanel>[0];

const renderPanel = (props: Partial<PanelProps> = {}) =>
  render(
    <ProposalDetailPanel
      proposal={baseProposal()}
      accountId={MEMBER_A}
      signerKind="hashpack"
      governanceAccountId={GOVERNANCE_ACCOUNT_ID}
      executorContractId={EXECUTOR_CONTRACT_ID}
      network="testnet"
      refresh={vi.fn()}
      markRegistryEntryCancelled={vi.fn()}
      {...props}
    />,
  );

const REGISTRY_CALL = {
  kind: "registryCall",
  proposalId: 7,
  executorContractId: EXECUTOR_CONTRACT_ID,
  gas: 150_000,
  payableTinybars: 0n,
} as const;

const PENDING_UPGRADE_ENTRY = {
  status: "read",
  entry: {
    proposalId: 7,
    state: "pending",
    target: "0x3f806946439c3521eeD7d740c3f84E09888C0419",
    proposer: "0x0000000000000000000000000000000000000001",
    calldata: "0x",
    operation: {
      kind: "upgrade",
      target: "0x3f806946439c3521eeD7d740c3f84E09888C0419",
      implementation: "0x0000000000000000000000000000000000a2d434",
      initializerCalldata: "0x",
      initializer: { kind: "none" },
    },
  },
} as const;
afterEach(cleanup);

describe("ProposalDetailPanel", () => {
  it("leads the page with the kind, what it does, its three steps and how many signatures it still needs", () => {
    renderPanel();
    expect(screen.getByText("Proposal 0.0.777")).toBeTruthy();
    const title = screen.getByRole("heading", { level: 1, name: "Pay a supplier" });
    expect(title.className).toContain("text-lg");
    expect(screen.getByText("Native operation · no registry entry, no event")).toBeTruthy();
    for (const stage of ["Create", "Sign", "Executed"]) expect(screen.getByText(stage)).toBeTruthy();
    expect(screen.getByText("more signature needed")).toBeTruthy();
    expect(screen.getByText(/2-of-2 council · 1 signed/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Council" })).toBeTruthy();
  });

  it("steps its headings down one level and leaves the visible title to the card when it opens under one", () => {
    renderPanel({ variant: "inline" });
    const title = screen.getByRole("heading", { level: 2, name: "Pay a supplier" });
    expect(title.className).toContain("sr-only");
    expect(title.parentElement?.className).toContain("px-4");
    expect(screen.getByRole("heading", { level: 3, name: "Council" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "On HashScan" })).toBeTruthy();
  });

  it("puts Sign on the connected member's own row, and nowhere else", () => {
    const sign = vi.fn();
    vi.mocked(useSignProposal).mockReturnValue({ mutate: sign, isPending: false, error: null } as unknown as ReturnType<
      typeof useSignProposal
    >);
    renderPanel({ accountId: MEMBER_B });

    const row = screen.getByText("your wallet").closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Sign with HashPack" }));
    expect(sign).toHaveBeenCalledWith("0.0.777", expect.anything());
    expect(screen.getAllByRole("button", { name: /^Sign with/ })).toHaveLength(1);
  });

  it("names the signer the button will ask", () => {
    renderPanel({ accountId: MEMBER_B, signerKind: "burner" });
    expect(screen.getByRole("button", { name: "Sign with the test signer" })).toBeTruthy();
  });

  it("offers no Sign to a member who already signed, or with no wallet connected", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: /^Sign with/ })).toBeNull();
    cleanup();
    renderPanel({ accountId: null });
    expect(screen.queryByRole("button", { name: /^Sign with/ })).toBeNull();
  });

  it("still offers Sign to an account it cannot match to a seat, under the council", () => {
    renderPanel({ accountId: "0.0.9999" });
    const sign = screen.getByRole("button", { name: "Sign with HashPack" });
    expect(sign.closest("li")).toBeNull();
  });

  it("still offers Sign when the registry could not be read, with a warning after it", () => {
    renderPanel({
      accountId: MEMBER_B,
      proposal: baseProposal({ operation: REGISTRY_CALL, registry: { status: "unreachable", reason: "fetch failed" } }),
    });
    const sign = screen.getByRole("button", { name: "Sign with HashPack" });
    const warning = screen.getByText(UNREACHABLE_REGISTRY_SIGN_WARNING);
    expect(warning.getAttribute("role")).toBe("status");
    expect(sign.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("names the seats and the route as the map does", () => {
    renderPanel({
      proposal: baseProposal({ operation: REGISTRY_CALL, registry: PENDING_UPGRADE_ENTRY }),
      memberNames: { [KEY_A]: { name: "You" }, [KEY_B]: { name: "Bob", caption: "demo co-signer" } },
      route: ["Treasury", "Proposal registry", "Vault"],
    });
    expect(screen.getByRole("heading", { level: 1, name: "Upgrade the vault to v2" })).toBeTruthy();
    expect(screen.getByText("Contract operation · goes through the registry")).toBeTruthy();
    const route = screen.getByRole("list", { name: "Path it travels" });
    expect(
      within(route)
        .getAllByRole("listitem")
        .map(item => item.textContent),
    ).toEqual(["Treasury", "→Proposal registry", "→Vault"]);
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByText("demo co-signer")).toBeTruthy();
  });

  it("renders both councils for a rotation, each against its own threshold", () => {
    const incomingCouncil = { threshold: 2, memberKeys: [KEY_X, KEY_Y] };
    renderPanel({
      accountId: null,
      proposal: baseProposal({
        operation: { kind: "councilRotation", accountId: GOVERNANCE_ACCOUNT_ID, council: incomingCouncil },
        incomingProgress: { signed: 0, threshold: 2, signedBy: [] },
      }),
    });
    expect(
      screen.getByRole("heading", { level: 2, name: "Current council · 1 of 2 required signatures" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "Incoming council · 0 of 2 required signatures" }),
    ).toBeTruthy();
    // One more from the current council, two from the incoming one.
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText(/Replacing the council needs signatures from both sides/)).toBeTruthy();
  });

  it("says once that there is no reject and when it expires, without repeating the map's status note", () => {
    renderPanel({
      proposal: baseProposal({
        state: {
          status: "pending",
          signatureCount: 1,
          executedAt: null,
          expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60_000),
          isSettled: false,
        },
      }),
    });
    expect(screen.getByText("There is no reject button.")).toBeTruthy();
    expect(screen.getByText(/expires on its own — 3d 0h from now/)).toBeTruthy();
    expect(screen.queryByText(LIVE_MAP_STATUS_NOTE)).toBeNull();
  });

  it("links the schedule and the transaction that created it on HashScan", () => {
    renderPanel({ proposal: baseProposal({ schedule: schedule({ consensus_timestamp: "1727500000.000000001" }) }) });
    const links = within(screen.getByRole("region", { name: "On HashScan" })).getAllByRole("link");
    expect(links.map(link => link.getAttribute("href"))).toEqual([
      "https://hashscan.io/testnet/schedule/0.0.777",
      "https://hashscan.io/testnet/transaction/1727500000.000000001",
    ]);
    expect(links[0].textContent).toContain("active");
    expect(links[1].textContent).toContain(`Scheduled by ${MEMBER_A}`);
  });

  it("says when each member signed, linking that signature's transaction on HashScan", () => {
    const signedAt = Date.now() / 1000 - 3 * 3600;
    const signatureRow = {
      consensus_timestamp: `${Math.floor(signedAt)}.000000001`,
      public_key_prefix: KEY_A,
      signature: "",
      type: "ED25519",
    };
    renderPanel({ accountId: null, proposal: baseProposal({ schedule: schedule({ signatures: [signatureRow] }) }) });

    const link = screen.getByRole("link", { name: `${MEMBER_A}: signed 3h ago — open the signature on HashScan` });
    expect(link.textContent).toBe("Signed 3h ago");
    expect(link.getAttribute("href")).toBe(
      `https://hashscan.io/testnet/transaction/${signatureRow.consensus_timestamp}`,
    );
    expect(within(screen.getByText(MEMBER_B).closest("li")!).getByText("Not yet")).toBeTruthy();
  });

  it("folds the raw ids, function and gas away under one disclosure", () => {
    renderPanel({ proposal: baseProposal({ operation: REGISTRY_CALL, registry: PENDING_UPGRADE_ENTRY }) });
    const raw = screen.getByText("Raw ids, function and calldata").closest("details")!;
    expect(raw.open).toBe(false);
    expect(within(raw).getByText("execute(7) on the registry")).toBeTruthy();
    expect(within(raw).getByText(/150,000/)).toBeTruthy();
  });

  it("says what an executed proposal did", () => {
    renderPanel({
      proposal: baseProposal({
        state: { status: "executed", signatureCount: 2, executedAt: new Date(), expiresAt: null, isSettled: true },
        execution: { status: "succeeded", transaction: { result: "SUCCESS", consensus_timestamp: "1.2" } } as never,
        progress: { signed: 2, threshold: 2, signedBy: [KEY_A, KEY_B] },
      }),
    });
    expect(screen.getByText(/Status SUCCESS, fee paid by the treasury/)).toBeTruthy();
    expect(screen.getByText("Scheduled transaction · SUCCESS")).toBeTruthy();
    expect(screen.queryByText("There is no reject button.")).toBeNull();
  });
});
