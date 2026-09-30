import type { ReactElement } from "react";
import GovernanceLayout from "./layout";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render as renderPlain, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGovernanceConfig } from "~~/components/governance/GovernanceProvider";
import { type GovernanceConfig, isDemoInstance, resolveGovernanceConfig } from "~~/config/governanceConfig";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("~~/hooks/scaffold-hbar", () => ({ useTargetNetwork: () => ({ targetNetwork: { id: 296 } }) }));
vi.mock("~~/hooks/useSubmitProposalDraft", () => ({
  useSubmitProposalDraft: () => ({ mutate: vi.fn(), reset: vi.fn(), status: "idle", error: null }),
}));
vi.mock("~~/components/governance/LiveMapPane", () => ({
  LiveMapPane: ({ config }: { config: GovernanceConfig }) => <div>map pane of {config.governanceAccountId}</div>,
}));
// The map's reads, which the layout's playback runs: never the network from a test.
vi.mock("~~/hooks/mirror/useMapSnapshot", () => ({
  useMapSnapshot: () => ({ snapshot: null, previous: null, events: [], readAt: 0, error: null }),
}));
vi.mock("~~/config/governanceConfig", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/config/governanceConfig")>()),
  resolveGovernanceConfig: vi.fn(),
  isDemoInstance: vi.fn(() => false),
}));

const DEPLOYED = {
  address: "0x0000000000000000000000000000000000000001",
  abi: [],
  hederaContractId: "0.0.4242",
} as const;

const CONFIG: GovernanceConfig = {
  governanceAccountId: "0.0.10671146",
  demoTokenId: "0.0.9000",
  seedProposalId: 1,
  network: "testnet",
  executor: DEPLOYED,
  vault: DEPLOYED,
};

const render = (ui: ReactElement) =>
  renderPlain(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

const RailPage = () => <p>rail page for {useGovernanceConfig().governanceAccountId}</p>;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GovernanceLayout", () => {
  it("shows the setup notice instead of the map and the rail when governance is not configured", () => {
    vi.mocked(resolveGovernanceConfig).mockImplementation(() => {
      throw new Error("Run `yarn setup`");
    });

    render(
      <GovernanceLayout>
        <RailPage />
      </GovernanceLayout>,
    );

    expect(screen.getByText("Governance is not set up yet")).toBeTruthy();
    expect(screen.getByText("Run `yarn setup`")).toBeTruthy();
    expect(screen.queryByText(/rail page/)).toBeNull();
    expect(screen.queryByText(/map pane of/)).toBeNull();
  });

  it("renders the map pane beside the route's page and hands the page the resolved config", () => {
    vi.mocked(resolveGovernanceConfig).mockReturnValue(CONFIG);

    render(
      <GovernanceLayout>
        <RailPage />
      </GovernanceLayout>,
    );

    const mapPane = screen.getByRole("region", { name: "Live map" });
    expect(mapPane.textContent).toContain("map pane of 0.0.10671146");
    expect(mapPane.textContent).not.toContain("execute button");
    expect(screen.getByText("rail page for 0.0.10671146")).toBeTruthy();
    expect(mapPane.contains(screen.getByText(/rail page/))).toBe(false);
    expect(resolveGovernanceConfig).toHaveBeenCalledWith(296);
  });

  it("says so above the route's page when the app reads the demo instance", () => {
    vi.mocked(resolveGovernanceConfig).mockReturnValue(CONFIG);
    vi.mocked(isDemoInstance).mockReturnValue(true);

    render(
      <GovernanceLayout>
        <RailPage />
      </GovernanceLayout>,
    );

    expect(screen.getByRole("note").textContent).toContain("demo instance on testnet");
    expect(screen.getByRole("note").textContent).toContain("yarn setup");
    expect(screen.getByText("rail page for 0.0.10671146")).toBeTruthy();
  });

  it("shows no demo notice once the app reads its own instance", () => {
    vi.mocked(resolveGovernanceConfig).mockReturnValue(CONFIG);
    vi.mocked(isDemoInstance).mockReturnValue(false);

    render(
      <GovernanceLayout>
        <RailPage />
      </GovernanceLayout>,
    );

    expect(screen.queryByRole("note")).toBeNull();
  });
});
