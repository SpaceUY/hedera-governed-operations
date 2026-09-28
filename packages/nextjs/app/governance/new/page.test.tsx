import NewProposalPage from "./page";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ProposalDraft, draftTreasuryTransfer } from "~~/components/governance/wizard/drafts";
import { getGovernanceEntityIds } from "~~/config/governanceConfig";
import { useCouncil } from "~~/hooks/mirror/useCouncil";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { encodeUpgrade } from "~~/services/governance/encode";
import { PROPOSAL_KIND_COPY, openProposalCopy } from "~~/services/governance/proposalLabels";

const drafts = vi.hoisted(() => ({ upgrade: null as ProposalDraft | null, transfer: null as ProposalDraft | null }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("~~/hooks/scaffold-hbar", () => ({ useTargetNetwork: () => ({ targetNetwork: { id: 296 } }) }));
vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: vi.fn() }));
vi.mock("~~/hooks/mirror/useCouncil", () => ({ useCouncil: vi.fn() }));
vi.mock("~~/hooks/useSubmitProposalDraft", () => ({
  useSubmitProposalDraft: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isSuccess: false, error: null }),
}));
vi.mock("~~/components/governance/wizard/forms/TransferForm", async () => {
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
vi.mock("~~/components/governance/wizard/forms/UpgradeVaultForm", async () => {
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
vi.mock("~~/components/ConnectWallet", () => ({ ConnectWallet: () => <button>Connect</button> }));
vi.mock("~~/config/governanceConfig", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/config/governanceConfig")>()),
  getGovernanceEntityIds: vi.fn(),
  getDeployedContract: () => ({
    address: "0x0000000000000000000000000000000000000001",
    abi: [],
    hederaContractId: "0.0.4242",
  }),
}));

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

const setup = ({ accountId, proposers }: { accountId: string | null; proposers: string[] }) => {
  vi.mocked(getGovernanceEntityIds).mockReturnValue({
    governanceAccountId: TREASURY,
    demoTokenId: "0.0.9000",
    seedProposalId: 1,
  });
  vi.mocked(useHederaSigner).mockReturnValue({ accountId, isConnected: accountId !== null } as never);
  vi.mocked(useCouncil).mockReturnValue({
    data: {
      key: { threshold: 2, memberKeys: ["a", "b", "c"] },
      proposerAccountIds: proposers,
      unresolvableProposers: [],
    },
  } as never);
};

const cta = (kind: "upgrade" | "treasuryTransfer") =>
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
  fireEvent.click(screen.getByRole("button", { name: new RegExp(PROPOSAL_KIND_COPY.treasuryTransfer.title) }));

describe("NewProposalPage", () => {
  it("shows the setup notice when governance is not configured", () => {
    setup({ accountId: null, proposers: [] });
    vi.mocked(getGovernanceEntityIds).mockImplementation(() => {
      throw new Error("Run `yarn setup`");
    });
    render(<NewProposalPage />);
    expect(screen.getByText("Governance is not set up yet")).toBeTruthy();
  });

  it("opens on the vault upgrade, as the prototype does, and asks for a wallet", () => {
    setup({ accountId: null, proposers: [PROPOSER] });
    render(<NewProposalPage />);
    expect(screen.getByRole("heading", { name: "New proposal" })).toBeTruthy();
    expect(screen.getByText("upgrade form")).toBeTruthy();
    expect(screen.getByText(/Connect a wallet to propose/)).toBeTruthy();
    expect(cta("upgrade").disabled).toBe(true);
  });

  it("explains that a registry proposal needs PROPOSER_ROLE", () => {
    setup({ accountId: "0.0.5555", proposers: [PROPOSER] });
    render(<NewProposalPage />);
    expect(screen.getByText(/does not hold PROPOSER_ROLE/)).toBeTruthy();
  });

  it("lets anyone connected open a native proposal", () => {
    setup({ accountId: "0.0.5555", proposers: [PROPOSER] });
    render(<NewProposalPage />);
    pickTransfer();
    expect(screen.getByText("transfer form")).toBeTruthy();
    expect(screen.queryByText(/does not hold PROPOSER_ROLE/)).toBeNull();
    expect(cta("treasuryTransfer")).toBeTruthy();
  });

  it("lets a proposer submit a vault upgrade the council can read", () => {
    drafts.upgrade = UPGRADE_DRAFT;
    setup({ accountId: PROPOSER, proposers: [PROPOSER] });
    render(<NewProposalPage />);
    expect(cta("upgrade").disabled).toBe(false);
  });

  it("keeps a vault upgrade from an account without PROPOSER_ROLE", () => {
    drafts.upgrade = UPGRADE_DRAFT;
    setup({ accountId: "0.0.5555", proposers: [PROPOSER] });
    render(<NewProposalPage />);
    expect(cta("upgrade").disabled).toBe(true);
  });

  it("lets an account without PROPOSER_ROLE submit a supplier payment", () => {
    drafts.transfer = draftTreasuryTransfer(TREASURY, { recipientAccountId: "0.0.500", amount: "1" });
    setup({ accountId: "0.0.5555", proposers: [PROPOSER] });
    render(<NewProposalPage />);
    pickTransfer();
    expect(cta("treasuryTransfer").disabled).toBe(false);
  });

  it("refuses a draft the council could not read, and says why", () => {
    drafts.upgrade = UNREADABLE_DRAFT;
    setup({ accountId: PROPOSER, proposers: [PROPOSER] });
    render(<NewProposalPage />);
    expect(screen.getByRole("alert").textContent).toContain("The council could not read this proposal");
    expect(cta("upgrade").disabled).toBe(true);
  });

  it("says why a registry proposal cannot be submitted while the council cannot be read", () => {
    drafts.upgrade = UPGRADE_DRAFT;
    setup({ accountId: PROPOSER, proposers: [PROPOSER] });
    vi.mocked(useCouncil).mockReturnValue({ data: undefined, isError: true } as never);
    render(<NewProposalPage />);
    expect(screen.getByRole("status").textContent).toBe(
      "Could not read who holds PROPOSER_ROLE right now, so this proposal cannot be registered yet.",
    );
    expect(cta("upgrade").disabled).toBe(true);
  });
});
