import { GovernanceMap } from "./GovernanceMap";
import { MapDecoratorProvider } from "./MapDecoratorContext";
import { MAP_SNAPSHOT } from "./mapFixtures";
import type { MapDecorator } from "./mapModel";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { useProposals } from "~~/hooks/mirror/useProposals";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { GOVERNANCE_ACCOUNT_NODE_ID } from "~~/services/governance/graph";

vi.mock("~~/hooks/mirror/useProposals", () => ({ useProposals: vi.fn() }));
vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: vi.fn() }));
vi.mock("~~/hooks/scaffold-hbar", () => ({ useTargetNetwork: () => ({ targetNetwork: { id: 296 } }) }));
vi.mock("~~/utils/scaffold-hbar/contract", () => ({
  contracts: { 296: { SaucerSwapAdapter: { address: "0x5aF0000000000000000000000000000000000003", abi: [] } } },
}));

const CONFIG = {
  governanceAccountId: MAP_SNAPSHOT.governanceAccountId,
  demoTokenId: "0.0.6000",
  seedProposalId: 1,
  network: "testnet",
  executor: { address: "0x5aF0000000000000000000000000000000000000", abi: [], hederaContractId: "0.0.5000" },
  vault: { address: "0x3f806946439c3521eeD7d740c3f84E09888C0419", abi: [], hederaContractId: "0.0.5001" },
} as GovernanceConfig;

function mockReads(council: object) {
  vi.mocked(useProposals).mockReturnValue({ council, inbox: { data: { proposals: [] } } } as never);
}

const COUNCIL_READ = {
  data: {
    key: MAP_SNAPSHOT.council,
    proposers: MAP_SNAPSHOT.proposers,
    proposerAccountIds: [],
    unresolvableProposers: [],
  },
};

function connect(accountId: string | null) {
  vi.mocked(useHederaSigner).mockReturnValue({ accountId } as ReturnType<typeof useHederaSigner>);
}

beforeEach(() => {
  vi.mocked(useProposals).mockReset();
  connect(null);
});

describe("GovernanceMap", () => {
  it("reads the council and the inbox for the configured governance account", () => {
    mockReads(COUNCIL_READ);
    render(<GovernanceMap config={CONFIG} />);
    expect(vi.mocked(useProposals)).toHaveBeenCalledWith({
      governanceAccountId: "0.0.4000",
      executorContractId: "0.0.5000",
      network: "testnet",
    });
  });

  it("renders with no demo module: every node placed by role and named by role or id", () => {
    mockReads(COUNCIL_READ);
    render(<GovernanceMap config={CONFIG} />);
    expect(screen.getByRole("graphics-document")).toBeTruthy();
    expect(screen.getByText("Treasury")).toBeTruthy();
    expect(screen.getByText("0.0.4101")).toBeTruthy();
    // The adapter has no native id in this deployment and is still on the map, by its address.
    expect(screen.getByText("Swap adapter")).toBeTruthy();
    // TokenAdmin is not deployed at all: it is left off rather than crashing the map.
    expect(screen.queryByText("Token admin")).toBeNull();
    expect(screen.getByRole("complementary", { name: "Legend" })).toBeTruthy();
  });

  it("lets the host's decoration place and name the nodes", () => {
    mockReads(COUNCIL_READ);
    const decorate: MapDecorator = () => ({
      layout: { width: 500, height: 400, positions: {}, labels: { [GOVERNANCE_ACCOUNT_NODE_ID]: "The treasury" } },
    });
    render(
      <MapDecoratorProvider decorate={decorate}>
        <GovernanceMap config={CONFIG} />
      </MapDecoratorProvider>,
    );
    expect(screen.getByText("The treasury")).toBeTruthy();
    expect(screen.getByRole("graphics-document").getAttribute("viewBox")).toBe("0 0 500 400");
  });

  it("names the connected account's seat You, and nobody without a wallet", () => {
    mockReads(COUNCIL_READ);
    const { rerender } = render(<GovernanceMap config={CONFIG} />);
    expect(screen.queryByText("You")).toBeNull();

    connect("0.0.4101");
    rerender(<GovernanceMap config={CONFIG} />);
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.queryByText("0.0.4101")).toBeNull();
  });

  it("says it is reading while the council has not arrived", () => {
    mockReads({ data: undefined, error: null });
    render(<GovernanceMap config={CONFIG} />);
    expect(screen.getByText(/Reading the council/)).toBeTruthy();
    expect(screen.queryByRole("graphics-document")).toBeNull();
  });

  it("says so when the council cannot be read", () => {
    mockReads({ data: undefined, error: new Error("Mirror is down") });
    render(<GovernanceMap config={CONFIG} />);
    expect(screen.getByRole("alert").textContent).toMatch(/could not be read/);
  });
});
