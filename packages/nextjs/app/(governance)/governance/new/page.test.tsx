import NewProposalPage from "./page";
import { encodeUpgrade } from "@sh/core/governance/encode";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GovernanceProvider } from "~~/components/governance/GovernanceProvider";
import { OPEN_PROPOSAL_NOTICES, PROPOSAL_KIND_COPY, openProposalCopy } from "~~/components/governance/wizard/copy";
import { TOKEN_ADMIN_COPY } from "~~/components/governance/wizard/kinds/tokenAdmin/copy";
import { TREASURY_SWAP_COPY } from "~~/components/governance/wizard/kinds/treasurySwap/copy";
import { VAULT_UPGRADE_COPY } from "~~/components/governance/wizard/kinds/vaultUpgrade/copy";
import { type GovernanceConfig, findDeployedContract } from "~~/config/governanceConfig";
import { useCouncil } from "~~/hooks/mirror/useCouncil";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { type ProposalDraft, draftTreasuryTransfer } from "~~/services/governance/drafts";

const drafts = vi.hoisted(() => ({ upgrade: null as ProposalDraft | null, transfer: null as ProposalDraft | null }));
const push = vi.hoisted(() => vi.fn());
// The wallet and Mirror are out of the picture: the submit resolves at once with a schedule id.
const reset = vi.hoisted(() => vi.fn());
const mutate = vi.hoisted(() =>
  vi.fn((_draft: unknown, options?: { onSuccess?: (scheduleId: string) => void }) => options?.onSuccess?.("0.0.901")),
);

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("~~/hooks/scaffold-hbar", () => ({ useTargetNetwork: () => ({ targetNetwork: { id: 296 } }) }));
vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: vi.fn() }));
vi.mock("~~/hooks/mirror/useCouncil", () => ({ useCouncil: vi.fn() }));
vi.mock("~~/hooks/useSubmitProposalDraft", () => ({
  useSubmitProposalDraft: () => ({ mutate, reset, status: "idle", error: null }),
}));
vi.mock("~~/components/governance/wizard/kinds/treasuryTransfer/TransferForm", async () => {
  const { useEffect } = await import("react");
  return {
    TransferForm: ({ onDraftChange }: { onDraftChange: (result: unknown) => void }) => {
      useEffect(() => {
        if (drafts.transfer) onDraftChange({ status: "ready", draft: drafts.transfer });
      }, [onDraftChange]);
      return <div>transfer form</div>;
    },
  };
});
vi.mock("~~/components/governance/wizard/kinds/vaultUpgrade/UpgradeVaultForm", async () => {
  const { useEffect } = await import("react");
  return {
    UpgradeVaultForm: ({ onDraftChange }: { onDraftChange: (result: unknown) => void }) => {
      useEffect(() => {
        if (drafts.upgrade) onDraftChange({ status: "ready", draft: drafts.upgrade });
      }, [onDraftChange]);
      return <div>upgrade form</div>;
    },
  };
});
vi.mock("~~/components/governance/wizard/kinds/tokenAdmin/TokenAdminForm", () => ({
  TokenAdminForm: () => <div>token form</div>,
}));
vi.mock("~~/components/governance/wizard/kinds/treasurySwap/TreasurySwapForm", () => ({
  TreasurySwapForm: () => <div>swap form</div>,
}));
vi.mock("~~/components/ConnectWallet", () => ({ ConnectWallet: () => <button>Connect</button> }));
vi.mock("~~/config/governanceConfig", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/config/governanceConfig")>()),
  findDeployedContract: vi.fn(),
}));

const DEPLOYED = {
  address: "0x0000000000000000000000000000000000000001",
  abi: [],
  hederaContractId: "0.0.4242",
} as const;

const PROPOSER = "0.0.1001";
const TREASURY = "0.0.10671146";
const PROXY = "0x0000000000000000000000000000000000000001";
const IMPLEMENTATION = "0x0000000000000000000000000000000000000002";

const UPGRADE_DRAFT: ProposalDraft = {
  path: "registry",
  kind: "upgrade",
  target: "Vault · 0.0.4242",
  proposal: encodeUpgrade({ proxy: PROXY, implementation: IMPLEMENTATION }),
};

const UNREADABLE_DRAFT: ProposalDraft = {
  path: "registry",
  kind: "upgrade",
  target: "Vault · 0.0.4242",
  proposal: { target: PROXY, calldata: "0x", registerGas: 1, executeGas: 1, payableTinybars: 0n },
};

const CONFIG: GovernanceConfig = {
  governanceAccountId: TREASURY,
  demoTokenId: "0.0.9000",
  seedProposalId: 1,
  network: "testnet",
  executor: DEPLOYED,
  vault: DEPLOYED,
};

/** The page as the governance layout hosts it: inside the provider that owns the draft and the submit. */
const renderPage = () =>
  render(
    <GovernanceProvider config={CONFIG}>
      <NewProposalPage />
    </GovernanceProvider>,
  );

const setup = ({ accountId, proposers }: { accountId: string | null; proposers: string[] }) => {
  vi.mocked(findDeployedContract).mockReturnValue(DEPLOYED);
  vi.mocked(useHederaSigner).mockReturnValue({ accountId, isConnected: accountId !== null } as never);
  vi.mocked(useCouncil).mockReturnValue({
    data: {
      key: { threshold: 2, memberKeys: ["a", "b", "c"] },
      proposerAccountIds: proposers,
      unresolvableProposers: [],
    },
  } as never);
};

const cta = (kind: "upgrade" | "tokenAdmin" | "treasuryTransfer") =>
  screen.getByRole("button", { name: openProposalCopy(kind).cta }) as HTMLButtonElement;

beforeEach(() => {
  drafts.upgrade = null;
  drafts.transfer = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const pickTransfer = () =>
  fireEvent.click(screen.getByRole("radio", { name: new RegExp(PROPOSAL_KIND_COPY.treasuryTransfer.title) }));

describe("NewProposalPage", () => {
  it("offers no upgrade form while the vault's next implementation is not deployed, and still pays a supplier", () => {
    drafts.transfer = draftTreasuryTransfer(TREASURY, { recipientAccountId: "0.0.500", amount: "1" });
    setup({ accountId: "0.0.5555", proposers: [PROPOSER] });
    vi.mocked(findDeployedContract).mockReturnValue(null);
    renderPage();
    expect(screen.queryByText("Governance is not set up yet")).toBeNull();
    expect(screen.queryByText("upgrade form")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(VAULT_UPGRADE_COPY.targetMissing);
    expect(cta("upgrade").disabled).toBe(true);

    pickTransfer();
    expect(screen.queryByText(VAULT_UPGRADE_COPY.targetMissing)).toBeNull();
    expect(cta("treasuryTransfer").disabled).toBe(false);
  });

  it("says TokenAdmin is not deployed instead of offering a token form that could not be submitted", () => {
    setup({ accountId: PROPOSER, proposers: [PROPOSER] });
    vi.mocked(findDeployedContract).mockReturnValue(null);
    renderPage();

    fireEvent.click(screen.getByRole("radio", { name: new RegExp(PROPOSAL_KIND_COPY.tokenAdmin.title) }));

    expect(screen.getByRole("status").textContent).toBe(TOKEN_ADMIN_COPY.contractMissing);
    expect(cta("tokenAdmin").disabled).toBe(true);
  });

  it("says the swap adapter is not deployed instead of offering a swap form", () => {
    setup({ accountId: PROPOSER, proposers: [PROPOSER] });
    vi.mocked(findDeployedContract).mockReturnValue(null);
    renderPage();

    fireEvent.click(screen.getByRole("radio", { name: new RegExp(PROPOSAL_KIND_COPY.treasurySwap.title) }));

    expect(screen.queryByText("swap form")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(TREASURY_SWAP_COPY.adapterMissing);
  });

  it("opens on the vault upgrade, as the prototype does, and asks for a wallet", () => {
    setup({ accountId: null, proposers: [PROPOSER] });
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "New proposal" })).toBeTruthy();
    expect(screen.getByText("upgrade form")).toBeTruthy();
    expect(screen.getByText(OPEN_PROPOSAL_NOTICES.connectWallet)).toBeTruthy();
    expect(cta("upgrade").disabled).toBe(true);
  });

  it("explains that a registry proposal needs PROPOSER_ROLE", () => {
    setup({ accountId: "0.0.5555", proposers: [PROPOSER] });
    renderPage();
    expect(screen.getByText(/does not hold PROPOSER_ROLE/)).toBeTruthy();
  });

  it("lets anyone connected open a native proposal", () => {
    setup({ accountId: "0.0.5555", proposers: [PROPOSER] });
    renderPage();
    pickTransfer();
    expect(screen.getByText("transfer form")).toBeTruthy();
    expect(screen.queryByText(/does not hold PROPOSER_ROLE/)).toBeNull();
    expect(cta("treasuryTransfer")).toBeTruthy();
  });

  it("lets a proposer submit a vault upgrade the council can read, then opens its page", () => {
    drafts.upgrade = UPGRADE_DRAFT;
    setup({ accountId: PROPOSER, proposers: [PROPOSER] });
    renderPage();
    expect(cta("upgrade").disabled).toBe(false);
    expect(screen.getByRole("heading", { level: 2, name: "What the council will see" })).toBeTruthy();

    fireEvent.click(cta("upgrade"));

    expect(mutate).toHaveBeenCalledWith(UPGRADE_DRAFT, expect.anything());
    expect(push).toHaveBeenCalledWith("/governance/0.0.901");
  });

  it("keeps a vault upgrade from an account without PROPOSER_ROLE", () => {
    drafts.upgrade = UPGRADE_DRAFT;
    setup({ accountId: "0.0.5555", proposers: [PROPOSER] });
    renderPage();
    expect(cta("upgrade").disabled).toBe(true);
  });

  it("lets an account without PROPOSER_ROLE submit a supplier payment", () => {
    drafts.transfer = draftTreasuryTransfer(TREASURY, { recipientAccountId: "0.0.500", amount: "1" });
    setup({ accountId: "0.0.5555", proposers: [PROPOSER] });
    renderPage();
    pickTransfer();
    expect(cta("treasuryTransfer").disabled).toBe(false);
  });

  it("refuses a draft the council could not read, and says why", () => {
    drafts.upgrade = UNREADABLE_DRAFT;
    setup({ accountId: PROPOSER, proposers: [PROPOSER] });
    renderPage();
    expect(screen.getByRole("alert").textContent).toContain("The council could not read this proposal");
    expect(cta("upgrade").disabled).toBe(true);
  });

  it("says why a registry proposal cannot be submitted while the council cannot be read", () => {
    drafts.upgrade = UPGRADE_DRAFT;
    setup({ accountId: PROPOSER, proposers: [PROPOSER] });
    vi.mocked(useCouncil).mockReturnValue({ data: undefined, isError: true } as never);
    renderPage();
    expect(screen.getByRole("status").textContent).toBe(OPEN_PROPOSAL_NOTICES.proposersUnreadable);
    expect(cta("upgrade").disabled).toBe(true);
  });

  it("says it is still reading the proposers rather than leaving the button disabled without a reason", () => {
    drafts.upgrade = UPGRADE_DRAFT;
    setup({ accountId: PROPOSER, proposers: [PROPOSER] });
    vi.mocked(useCouncil).mockReturnValue({ data: undefined, isError: false } as never);
    renderPage();
    expect(screen.getByRole("status").textContent).toBe(OPEN_PROPOSAL_NOTICES.proposersLoading);
    expect(cta("upgrade").disabled).toBe(true);
  });
});
