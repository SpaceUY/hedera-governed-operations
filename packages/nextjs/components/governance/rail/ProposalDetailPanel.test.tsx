import { ProposalDetailPanel } from "./ProposalDetailPanel";
import type { Proposal } from "@sh/core/governance/proposals";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccount } from "~~/hooks/mirror/useAccount";
import { useCouncil } from "~~/hooks/mirror/useCouncil";
import { useCouncilBefore } from "~~/hooks/mirror/useCouncilBefore";
import { useProposals } from "~~/hooks/mirror/useProposals";
import { useCoSigningAgent } from "~~/hooks/useCoSigningAgent";
import { useDemoSign, useDemoSignatureState, useDemoSigners } from "~~/hooks/useDemoSigners";
import { useSignProposal } from "~~/hooks/useSignProposal";
import { useWithdrawProposal } from "~~/hooks/useWithdrawProposal";
import { UNREACHABLE_REGISTRY_SIGN_WARNING } from "~~/services/governance/proposalLabels";

vi.mock("~~/hooks/mirror/useCouncil", () => ({ useCouncil: vi.fn() }));
vi.mock("~~/hooks/mirror/useCouncilBefore", () => ({ useCouncilBefore: vi.fn() }));
vi.mock("~~/hooks/mirror/useAccount", () => ({ useAccount: vi.fn() }));
vi.mock("~~/hooks/mirror/useProposals", () => ({ useProposals: vi.fn() }));
vi.mock("~~/hooks/useSignProposal", () => ({ useSignProposal: vi.fn(), useSignatureInFlight: () => false }));
vi.mock("~~/hooks/useCancelProposalFlow", () => ({
  useCancelProposalFlow: () => ({ step: "idle", start: vi.fn(), error: null }),
}));
vi.mock("~~/hooks/useWithdrawProposal", () => ({ useWithdrawProposal: vi.fn() }));
vi.mock("~~/hooks/useCoSigningAgent", () => ({ useCoSigningAgent: vi.fn() }));
vi.mock("~~/hooks/useDemoSigners", () => ({
  useDemoSigners: vi.fn(),
  useDemoSign: vi.fn(),
  useDemoSignatureState: vi.fn(),
  useDemoSignaturePending: () => false,
}));

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
  vi.mocked(useCoSigningAgent).mockReturnValue(null);
  vi.mocked(useDemoSigners).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useDemoSigners>);
  vi.mocked(useDemoSignatureState).mockReturnValue("none");
  vi.mocked(useCouncilBefore).mockReturnValue({ data: undefined, isError: false } as unknown as ReturnType<
    typeof useCouncilBefore
  >);
  vi.mocked(useDemoSign).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    error: null,
  } as unknown as ReturnType<typeof useDemoSign>);
}

beforeEach(mockHooks);

type PanelProps = Parameters<typeof ProposalDetailPanel>[0];

const renderPanel = (props: Partial<PanelProps> = {}) =>
  render(
    <ProposalDetailPanel
      proposal={baseProposal()}
      accountId={MEMBER_A}
      signerKind="hashpack"
      walletName={null}
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
    fireEvent.click(within(row).getByRole("button", { name: "Sign with your wallet" }));
    expect(sign).toHaveBeenCalledWith("0.0.777", expect.anything());
    expect(screen.getAllByRole("button", { name: /^Sign with/ })).toHaveLength(1);
  });

  it("names the signer the button will ask", () => {
    renderPanel({ accountId: MEMBER_B, signerKind: "burner" });
    expect(screen.getByRole("button", { name: "Sign with the test signer" })).toBeTruthy();
    cleanup();
    renderPanel({ accountId: MEMBER_B, walletName: "Kabila" });
    expect(screen.getByRole("button", { name: "Sign with Kabila" })).toBeTruthy();
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
    const sign = screen.getByRole("button", { name: "Sign with your wallet" });
    expect(sign.closest("li")).toBeNull();
  });

  it("still offers Sign when the registry could not be read, with a warning after it", () => {
    renderPanel({
      accountId: MEMBER_B,
      proposal: baseProposal({ operation: REGISTRY_CALL, registry: { status: "unreachable", reason: "fetch failed" } }),
    });
    const sign = screen.getByRole("button", { name: "Sign with your wallet" });
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

  it("offers Sign once to a member of both councils, and says on the incoming row that it counts there too", () => {
    const incomingCouncil = { threshold: 2, memberKeys: [KEY_B, KEY_X] };
    renderPanel({
      accountId: MEMBER_B,
      proposal: baseProposal({
        operation: { kind: "councilRotation", accountId: GOVERNANCE_ACCOUNT_ID, council: incomingCouncil },
        incomingProgress: { signed: 0, threshold: 2, signedBy: [] },
      }),
    });

    expect(screen.getAllByRole("button", { name: "Sign with your wallet" })).toHaveLength(1);
    const incoming = screen.getByRole("region", { name: /Incoming council/ });
    expect(within(incoming).getByText("Signing above counts here too")).toBeTruthy();
    expect(within(incoming).queryByRole("button", { name: "Sign with your wallet" })).toBeNull();
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
    expect(screen.queryByText(/There is no execute button/)).toBeNull();
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

  it("shows the co-signing agent as not seated, with the council seating it would make, while it holds no seat", () => {
    vi.mocked(useCoSigningAgent).mockReturnValue({ accountId: "0.0.4999", seat: KEY_X });
    renderPanel();
    const row = screen.getByText("Co-signing agent").closest("li")!;
    expect(within(row).getByText("AG")).toBeTruthy();
    expect(within(row).getByText("not a member")).toBeTruthy();
    expect(within(row).getByText("not seated")).toBeTruthy();
    expect(within(row).getByText("Approve “Add the co-signing agent” to seat it (2-of-3 council).")).toBeTruthy();
  });

  it("names the co-signing agent's own seat instead once it holds one, and shows no agent without one configured", () => {
    vi.mocked(useCoSigningAgent).mockReturnValue({ accountId: "0.0.4999", seat: KEY_B });
    renderPanel({ accountId: null });
    const row = screen.getByText("Co-signing agent").closest("li")!;
    expect(within(row).getByText("Not yet")).toBeTruthy();
    expect(screen.queryByText("not seated")).toBeNull();
    cleanup();

    vi.mocked(useCoSigningAgent).mockReturnValue(null);
    renderPanel();
    expect(screen.queryByText("Co-signing agent")).toBeNull();
  });

  it("captions the seated co-signing agent's row as the map does", () => {
    vi.mocked(useCoSigningAgent).mockReturnValue({ accountId: "0.0.4999", seat: KEY_B });
    renderPanel({ memberNames: { [KEY_B]: { name: "Co-signing agent", caption: "seated by the council" } } });
    const row = screen.getByText("Co-signing agent").closest("li")!;
    expect(within(row).getByText("seated by the council")).toBeTruthy();
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
    expect(useCouncilBefore).toHaveBeenLastCalledWith(expect.objectContaining({ executedTimestamp: null }));
    expect(screen.getByText(/Status SUCCESS/).closest("[role=status]")?.textContent).toMatch(/^Executed/);
  });

  const executedRotation = (incoming: string[]) =>
    baseProposal({
      schedule: schedule({ executed_timestamp: "1790721693.093999572" }),
      state: { status: "executed", signatureCount: 2, executedAt: new Date(), expiresAt: null, isSettled: true },
      execution: { status: "succeeded", transaction: { result: "SUCCESS", consensus_timestamp: "1.2" } } as never,
      operation: {
        kind: "councilRotation",
        accountId: GOVERNANCE_ACCOUNT_ID,
        council: { threshold: 2, memberKeys: incoming },
      },
      incomingProgress: { signed: 2, threshold: 2, signedBy: [KEY_A, KEY_B] },
      progress: { signed: 2, threshold: 2, signedBy: [KEY_A, KEY_B] },
    });

  it("says an executed rotation seated the co-signing agent, from the council before it", () => {
    vi.mocked(useCoSigningAgent).mockReturnValue({ accountId: "0.0.4999", seat: KEY_X });
    vi.mocked(useCouncilBefore).mockReturnValue({ data: COUNCIL_KEY, isError: false } as unknown as ReturnType<
      typeof useCouncilBefore
    >);
    renderPanel({ proposal: executedRotation([KEY_A, KEY_B, KEY_X]) });
    expect(screen.getByText("The co-signing agent is seated · 2-of-3 council")).toBeTruthy();
    expect(useCouncilBefore).toHaveBeenLastCalledWith({
      governanceAccountId: GOVERNANCE_ACCOUNT_ID,
      executedTimestamp: "1790721693.093999572",
      network: "testnet",
    });
  });

  it("says only what the council is now when the earlier council could not be read", () => {
    vi.mocked(useCoSigningAgent).mockReturnValue({ accountId: "0.0.4999", seat: KEY_X });
    vi.mocked(useCouncilBefore).mockReturnValue({ data: undefined, isError: true } as unknown as ReturnType<
      typeof useCouncilBefore
    >);
    renderPanel({ proposal: executedRotation([KEY_A, KEY_B, KEY_X]) });
    expect(screen.getByText("The council is now 2-of-3")).toBeTruthy();
    expect(screen.queryByText(/is seated/)).toBeNull();
  });

  const DEMO_ALICE = { name: "alice", accountId: MEMBER_B, publicKey: KEY_B } as const;

  it("puts Sign as Alice on Alice's row with a demo key badge, and says where her key lives", () => {
    vi.mocked(useDemoSigners).mockReturnValue({ data: [DEMO_ALICE] } as never);
    renderPanel();
    const row = screen.getByText(MEMBER_B).closest("li")!;
    expect(within(row).getByRole("button", { name: "Sign as Alice" })).toBeTruthy();
    expect(within(row).getByText("demo key").className).toContain("badge-primary");
    expect(screen.getByText("Alice is a demo co-signer: the key lives server-side, testnet only.")).toBeTruthy();
  });

  it("keeps the badge and drops the button once Alice has signed", () => {
    vi.mocked(useDemoSigners).mockReturnValue({ data: [DEMO_ALICE] } as never);
    renderPanel({ proposal: baseProposal({ progress: { signed: 1, threshold: 2, signedBy: [KEY_B] } }) });
    const row = screen.getByText(MEMBER_B).closest("li")!;
    expect(within(row).queryByRole("button", { name: "Sign as Alice" })).toBeNull();
    expect(within(row).getByText("demo key")).toBeTruthy();
  });

  it("shows no demo button, badge or note without demo keys on the server", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: /Sign as/ })).toBeNull();
    expect(screen.queryByText("demo key")).toBeNull();
    expect(screen.queryByText(/demo co-signer/)).toBeNull();
  });

  it("names both demo members in one note, each with its own button, beside the viewer's own Sign", () => {
    const demoBob = { name: "bob", accountId: "0.0.4103", publicKey: KEY_X } as const;
    vi.mocked(useDemoSigners).mockReturnValue({ data: [DEMO_ALICE, demoBob] } as never);
    vi.mocked(useCouncil).mockReturnValue({
      data: {
        key: { threshold: 2, memberKeys: [KEY_A, KEY_B, KEY_X] },
        proposers: [...PROPOSERS, { accountId: "0.0.4103", key: KEY_X }],
        proposerAccountIds: [],
        unresolvableProposers: [],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useCouncil>);
    renderPanel({ proposal: baseProposal({ progress: { signed: 0, threshold: 2, signedBy: [] } }) });
    expect(screen.getByRole("button", { name: "Sign with your wallet" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign as Alice" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign as Bob" })).toBeTruthy();
    expect(
      screen.getByText("Alice and Bob are demo co-signers: their keys live server-side, testnet only."),
    ).toBeTruthy();
  });

  it("offers no demo signature on a proposal nobody may be asked to sign", () => {
    vi.mocked(useDemoSigners).mockReturnValue({ data: [DEMO_ALICE] } as never);
    renderPanel({
      proposal: baseProposal({
        state: { status: "executed", signatureCount: 2, executedAt: null, expiresAt: null, isSettled: true },
        progress: { signed: 2, threshold: 2, signedBy: [KEY_A, KEY_B] },
      }),
    });
    expect(screen.queryByRole("button", { name: /Sign as/ })).toBeNull();
    expect(screen.getByText("demo key")).toBeTruthy();
  });

  it("offers a rotation's demo signature once, on the current council, for a member of both", () => {
    vi.mocked(useDemoSigners).mockReturnValue({ data: [DEMO_ALICE] } as never);
    renderPanel({
      accountId: null,
      proposal: baseProposal({
        operation: {
          kind: "councilRotation",
          accountId: GOVERNANCE_ACCOUNT_ID,
          council: { threshold: 2, memberKeys: [KEY_B, KEY_X] },
        },
        incomingProgress: { signed: 0, threshold: 2, signedBy: [] },
      }),
    });
    expect(screen.getAllByRole("button", { name: "Sign as Alice" })).toHaveLength(1);
    const incoming = screen.getByRole("region", { name: /Incoming council/ });
    expect(within(incoming).getByText("Signing above counts here too")).toBeTruthy();
    expect(within(incoming).queryByRole("button", { name: "Sign as Alice" })).toBeNull();
  });
});
