import SettingsPage from "./page";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_COPY } from "~~/components/governance/settings/copy";

vi.mock("~~/components/governance/GovernanceProvider", () => ({
  useGovernanceConfig: () => ({
    network: "testnet",
    governanceAccountId: "0.0.500",
    executor: { hederaContractId: "0.0.600", address: "0x5aF0000000000000000000000000000000000Abc" },
  }),
}));
const council = vi.hoisted(() => ({
  data: {
    key: { threshold: 2, memberKeys: ["key-a", "key-b", "key-c"] },
    proposerAccountIds: [] as string[],
    proposers: [],
    unresolvableProposers: [],
  },
  isError: false,
}));
vi.mock("~~/hooks/mirror/useCouncil", () => ({ useCouncil: () => council }));
vi.mock("~~/hooks/mirror/useRegistryRoles", () => ({
  useRegistryRoles: () => ({
    data: { executors: [], proposerAdmins: [], executorAdmins: [] },
    isError: false,
  }),
}));
vi.mock("~~/components/governance/graph/useComposedMap", () => ({ useLatestComposedMap: () => ({ composed: null }) }));
vi.mock("~~/hooks/useCoSigningAgent", () => ({ useCoSigningAgent: () => null }));
vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: () => ({ accountId: null, isConnected: false }) }));
vi.mock("~~/hooks/mirror/useAccount", () => ({ useAccount: () => ({ data: undefined, error: null }) }));
vi.mock("~~/components/ConnectWallet", () => ({ ConnectWallet: () => <button>Connect</button> }));
vi.mock("~~/components/governance/wizard/ProposalWizardProvider", () => ({
  useProposalWizard: () => ({
    setDraft: () => undefined,
    preview: null,
    submit: () => undefined,
    submitStatus: "idle",
    submitError: null,
    walletRequest: null,
    lateSubmission: null,
  }),
}));

afterEach(() => {
  cleanup();
  council.data.key = { threshold: 2, memberKeys: ["key-a", "key-b", "key-c"] };
});

describe("SettingsPage", () => {
  it("titles the rail Settings and leads back to the map", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { level: 1, name: SETTINGS_COPY.heading })).toBeTruthy();
    expect(screen.getByRole("link", { name: SETTINGS_COPY.backLabel }).getAttribute("href")).toBe("/");
  });

  it("shows the council read from the treasury account's key", () => {
    render(<SettingsPage />);
    const card = screen.getByRole("region", { name: SETTINGS_COPY.council.heading });
    expect(within(card).getByText("2-of-3")).toBeTruthy();
  });

  it("shows the registry's roles without reading its proposal count", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { level: 2, name: SETTINGS_COPY.roles.heading })).toBeTruthy();
    expect(screen.queryByText(/proposalCount|entries registered/i)).toBeNull();
  });

  it("puts the council change composer between the council and the registry's roles", () => {
    render(<SettingsPage />);
    expect(screen.getAllByRole("heading", { level: 2 }).map(heading => heading.textContent)).toEqual([
      SETTINGS_COPY.council.heading,
      SETTINGS_COPY.composer.heading,
      SETTINGS_COPY.roles.heading,
    ]);
  });

  it("starts the composer over from a council that changed", () => {
    const { rerender } = render(<SettingsPage />);
    const stepper = () => screen.getByRole("group", { name: SETTINGS_COPY.composer.thresholdLabel });
    fireEvent.click(screen.getByRole("button", { name: SETTINGS_COPY.composer.fewer }));
    expect(within(stepper()).getByText("1-of-3")).toBeTruthy();
    council.data.key = { threshold: 3, memberKeys: ["key-a", "key-b", "key-c"] };
    rerender(<SettingsPage />);
    expect(within(stepper()).getByText("3-of-3")).toBeTruthy();
  });
});
