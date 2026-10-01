import type { ReactNode } from "react";
import { LiveMapPane } from "./LiveMapPane";
import { MapPlaybackProvider } from "./MapPlaybackProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MapDecoratorProvider } from "~~/components/governance/graph/MapDecoratorContext";
import { MAP_NODE_STATES } from "~~/components/governance/graph/copy";
import { MAP_SNAPSHOT } from "~~/components/governance/graph/mapFixtures";
import type { MapDecorator } from "~~/components/governance/graph/mapModel";
import { useMapPreview } from "~~/components/governance/graph/useMapPreview";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { useMapSnapshot } from "~~/hooks/mirror/useMapSnapshot";
import { useToken } from "~~/hooks/mirror/useToken";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { useRemoteApprovals } from "~~/hooks/useRemoteApprovals";
import type { GovernanceSnapshot } from "~~/services/liveMap/events/mapEvents";
import { GOVERNANCE_ACCOUNT_NODE_ID } from "~~/services/liveMap/model/graph";
import type { PreviewTarget } from "~~/services/liveMap/preview/previewSource";

vi.mock("~~/hooks/mirror/useMapSnapshot", () => ({ useMapSnapshot: vi.fn() }));
vi.mock("~~/hooks/mirror/useToken", () => ({ useToken: vi.fn() }));
vi.mock("~~/hooks/useCoSigningAgent", () => ({ useCoSigningAgent: () => null }));
vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: vi.fn() }));
vi.mock("~~/hooks/useCoSigningAgent", () => ({ useCoSigningAgent: () => null }));
vi.mock("~~/hooks/useRemoteApprovals", () => ({ useRemoteApprovals: vi.fn() }));
vi.mock("~~/components/governance/graph/useMapPreview", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/components/governance/graph/useMapPreview")>()),
  useMapPreview: vi.fn(),
}));
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

/** The layout's playback, as the governance layout provides it around the map pane. */
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <MapPlaybackProvider config={CONFIG}>{children}</MapPlaybackProvider>
  </QueryClientProvider>
);

const WORLD: GovernanceSnapshot = {
  council: MAP_SNAPSHOT.council,
  proposers: MAP_SNAPSHOT.proposers,
  proposals: [],
  unreachableProposers: [],
  treasury: {
    hbarBalanceTinybar: 12_345_000_000,
    demoTokenBalance: 1_000,
    usdcBalance: 7,
    vaultReserveTinybar: 50_000_000_000n,
  },
  nodeStates: { vaultImplementation: null, tokenPaused: null },
};

function read(snapshot: GovernanceSnapshot | null, error: unknown = null) {
  vi.mocked(useMapSnapshot).mockReturnValue({ snapshot, previous: null, events: [], error } as never);
}

function connect(accountId: string | null) {
  vi.mocked(useHederaSigner).mockReturnValue({ accountId } as ReturnType<typeof useHederaSigner>);
}

const TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0.0.6000": { symbol: "GOVD", decimals: 0 },
  "0.0.5449": { symbol: "USDC", decimals: 6 },
};

beforeEach(() => {
  vi.mocked(useMapSnapshot).mockReset();
  vi.mocked(useToken).mockImplementation(tokenId => {
    const token = TOKENS[tokenId ?? ""];
    return { data: token && { token, decimals: token.decimals }, isError: false } as never;
  });
  connect(null);
  previewing("none");
});

function previewing(targetKey: string, target: PreviewTarget = { kind: "none" }) {
  vi.mocked(useMapPreview).mockReturnValue({
    preview: null,
    target,
    title: null,
    targetKey,
  });
}

describe("LiveMapPane", () => {
  it("reads one snapshot of the configured governance account, with the network's USDC", () => {
    read(WORLD);
    render(<LiveMapPane config={CONFIG} />, { wrapper });
    expect(vi.mocked(useMapSnapshot)).toHaveBeenCalledWith({
      governanceAccountId: "0.0.4000",
      executorContractId: "0.0.5000",
      network: "testnet",
      vaultContractId: "0.0.5001",
      demoTokenId: "0.0.6000",
      usdcTokenId: "0.0.5449",
    });
    expect(vi.mocked(useToken)).toHaveBeenCalledWith("0.0.6000", { network: "testnet" });
    expect(vi.mocked(useToken)).toHaveBeenCalledWith("0.0.5449", { network: "testnet" });
  });

  it("draws the treasury figures and the map from the same world", () => {
    read(WORLD);
    render(<LiveMapPane config={CONFIG} />, { wrapper });
    const treasury = screen.getByRole("region", { name: "Treasury" });
    expect(within(treasury).getByText("123.45")).toBeTruthy();
    expect(within(treasury).getByText("500.00")).toBeTruthy();
    expect(within(treasury).getByText("0.00")).toBeTruthy();
    expect(within(treasury).getByText("GOVD").nextElementSibling?.textContent).toBe("1,000");
    expect(within(treasury).getByText("2-of-3")).toBeTruthy();
    expect(screen.getByRole("graphics-document")).toBeTruthy();
  });

  it("writes the token's state under it once read, and leaves the caption while it is not", () => {
    read({ ...WORLD, nodeStates: { vaultImplementation: null, tokenPaused: true } });
    const { unmount } = render(<LiveMapPane config={CONFIG} />, { wrapper });
    expect(screen.getByText(MAP_NODE_STATES.token.paused).tagName).toBe("text");
    unmount();

    read(WORLD);
    render(<LiveMapPane config={CONFIG} />, { wrapper });
    expect(screen.queryByText(MAP_NODE_STATES.token.paused)).toBeNull();
    expect(screen.queryByText(MAP_NODE_STATES.token.active)).toBeNull();
  });

  it("renders with no demo module: every node placed by role and named by role or id", () => {
    read(WORLD);
    render(<LiveMapPane config={CONFIG} />, { wrapper });
    expect(screen.getByText("0.0.4101")).toBeTruthy();
    // The adapter has no native id in this deployment and is still on the map, by its address.
    expect(screen.getByText("Swap adapter")).toBeTruthy();
    // TokenAdmin is not deployed at all: it is left off rather than crashing the map.
    expect(screen.queryByText("Token admin")).toBeNull();
    expect(screen.getByRole("complementary", { name: "Legend" })).toBeTruthy();
  });

  it("lets the host's decoration place and name the nodes", () => {
    read(WORLD);
    const decorate: MapDecorator = () => ({
      layout: { width: 500, height: 400, positions: {}, labels: { [GOVERNANCE_ACCOUNT_NODE_ID]: "The treasury" } },
    });
    render(
      <MapDecoratorProvider decorate={decorate}>
        <LiveMapPane config={CONFIG} />
      </MapDecoratorProvider>,
      { wrapper },
    );
    expect(screen.getByText("The treasury")).toBeTruthy();
    expect(screen.getByRole("graphics-document").getAttribute("viewBox")).toBe("0 0 500 400");
  });

  it("names the connected account's seat You, and nobody without a wallet", () => {
    read(WORLD);
    const { rerender } = render(<LiveMapPane config={CONFIG} />, { wrapper });
    expect(screen.queryByText("You")).toBeNull();

    connect("0.0.4101");
    rerender(<LiveMapPane config={CONFIG} />);
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.queryByText("0.0.4101")).toBeNull();
  });

  it("closes the inspector when the map starts showing another proposal", () => {
    read(WORLD);
    const { rerender } = render(<LiveMapPane config={CONFIG} />, { wrapper });
    const treasuryNode = document.querySelector(`[data-node-id="${GOVERNANCE_ACCOUNT_NODE_ID}"]`);
    fireEvent.click(treasuryNode as Element);
    expect(screen.getByRole("region", { name: "Inspector" })).toBeTruthy();

    const elsewhere = document.body.appendChild(document.createElement("button"));
    elsewhere.focus();
    previewing("schedule:0.0.7001", { kind: "schedule", scheduleId: "0.0.7001" });
    rerender(<LiveMapPane config={CONFIG} />);
    expect(screen.queryByRole("region", { name: "Inspector" })).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  it("heads the map with its caption, naming the council's rule", () => {
    read(WORLD);
    render(<LiveMapPane config={CONFIG} />, { wrapper });
    expect(screen.getByText("Nothing moves until the 2-of-3 council signs.")).toBeTruthy();
  });

  it("has no caption until the council is read", () => {
    read(null);
    render(<LiveMapPane config={CONFIG} />, { wrapper });
    expect(document.querySelector("[data-map-caption]")).toBeNull();
  });

  it("says it is reading until the first snapshot, and warns when the council cannot be read", () => {
    read(null);
    const { rerender } = render(<LiveMapPane config={CONFIG} />, { wrapper });
    expect(screen.getByText(/Reading the council/)).toBeTruthy();

    read(null, new Error("Mirror is down"));
    rerender(<LiveMapPane config={CONFIG} />);
    expect(screen.getByRole("alert").textContent).toMatch(/could not be read/);
  });

  it("watches the latest read for signatures this session did not send", () => {
    read(WORLD);
    render(<LiveMapPane config={CONFIG} />, { wrapper });
    expect(vi.mocked(useRemoteApprovals)).toHaveBeenCalledWith(expect.objectContaining({ events: [], world: WORLD }));
  });
});
