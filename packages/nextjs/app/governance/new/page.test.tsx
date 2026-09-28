import NewProposalPage from "./page";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getGovernanceEntityIds } from "~~/config/governanceConfig";
import { useCouncil } from "~~/hooks/mirror/useCouncil";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { PROPOSAL_KIND_COPY, openProposalCopy } from "~~/services/governance/proposalLabels";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("~~/hooks/scaffold-hbar", () => ({ useTargetNetwork: () => ({ targetNetwork: { id: 296 } }) }));
vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: vi.fn() }));
vi.mock("~~/hooks/mirror/useCouncil", () => ({ useCouncil: vi.fn() }));
vi.mock("~~/hooks/useSubmitProposalDraft", () => ({
  useSubmitProposalDraft: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isSuccess: false, error: null }),
}));
vi.mock("~~/components/governance/wizard/forms/TransferForm", () => ({ TransferForm: () => <div>transfer form</div> }));
vi.mock("~~/components/governance/wizard/forms/UpgradeVaultForm", () => ({
  UpgradeVaultForm: () => <div>upgrade form</div>,
}));
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

const setup = ({ accountId, proposers }: { accountId: string | null; proposers: string[] }) => {
  vi.mocked(getGovernanceEntityIds).mockReturnValue({
    governanceAccountId: "0.0.10671146",
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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
    fireEvent.click(screen.getByRole("button", { name: new RegExp(PROPOSAL_KIND_COPY.treasuryTransfer.title) }));
    expect(screen.getByText("transfer form")).toBeTruthy();
    expect(screen.queryByText(/does not hold PROPOSER_ROLE/)).toBeNull();
    expect(cta("treasuryTransfer")).toBeTruthy();
  });
});
