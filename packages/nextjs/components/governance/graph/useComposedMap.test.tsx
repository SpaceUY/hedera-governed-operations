import { KEY_C, MAP_SNAPSHOT } from "./mapFixtures";
import { composeMap } from "./mapModel";
import { useComposedMap, useLatestComposedMap } from "./useComposedMap";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { useProposals } from "~~/hooks/mirror/useProposals";
import { useCoSigningAgent } from "~~/hooks/useCoSigningAgent";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { memberNodeId } from "~~/services/liveMap/model/graph";
import { governanceEntitiesOf } from "~~/services/liveMap/model/graphEntities";

vi.mock("~~/hooks/mirror/useProposals", () => ({ useProposals: vi.fn() }));
vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: vi.fn() }));
vi.mock("~~/hooks/useCoSigningAgent", () => ({ useCoSigningAgent: vi.fn() }));
vi.mock("~~/hooks/scaffold-hbar", () => ({ useTargetNetwork: () => ({ targetNetwork: { id: 296 } }) }));
vi.mock("~~/utils/scaffold-hbar/contract", () => ({ contracts: {} }));

const CONFIG = {
  governanceAccountId: MAP_SNAPSHOT.governanceAccountId,
  demoTokenId: "0.0.6000",
  seedProposalId: 1,
  network: "testnet",
  executor: { address: "0x5aF0000000000000000000000000000000000000", abi: [], hederaContractId: "0.0.5000" },
  vault: { address: "0x3f806946439c3521eeD7d740c3f84E09888C0419", abi: [], hederaContractId: "0.0.5001" },
} as GovernanceConfig;

const WORLD = { council: MAP_SNAPSHOT.council, proposers: MAP_SNAPSHOT.proposers, proposals: [] };

const expectedMap = () =>
  composeMap(
    {
      governanceAccountId: CONFIG.governanceAccountId,
      executor: { ref: CONFIG.executor.hederaContractId, evmAddress: CONFIG.executor.address },
      entities: governanceEntitiesOf(CONFIG, 296),
      ...WORLD,
    },
    undefined,
    { viewerAccountId: null },
  );

beforeEach(() => {
  vi.mocked(useHederaSigner).mockReturnValue({ accountId: null } as ReturnType<typeof useHederaSigner>);
  vi.mocked(useCoSigningAgent).mockReturnValue(null);
});

describe("useComposedMap", () => {
  it("composes the map of the world it is given, for the configured deployment", () => {
    const { result } = renderHook(() => useComposedMap(CONFIG, WORLD));
    expect(result.current).toEqual(expectedMap());
  });

  it("composes nothing without a world", () => {
    expect(renderHook(() => useComposedMap(CONFIG, null)).result.current).toBeNull();
  });

  it("names the co-signing agent's seat as the agent, for the agent the app is told about", () => {
    vi.mocked(useCoSigningAgent).mockReturnValue({ accountId: "0.0.4103", seat: KEY_C });
    const { result } = renderHook(() => useComposedMap(CONFIG, WORLD));
    expect(result.current?.graph.nodes.find(node => node.id === memberNodeId(KEY_C))?.label).toBe("Co-signing agent");
    expect(useCoSigningAgent).toHaveBeenCalledWith("testnet");
  });

  it("keeps the same map while the world does not change", () => {
    const { result, rerender } = renderHook(() => useComposedMap(CONFIG, WORLD));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe("useLatestComposedMap", () => {
  const answer = (council: unknown, inbox: unknown) =>
    vi.mocked(useProposals).mockReturnValue({ council: { data: council }, inbox: { data: inbox } } as never);

  it("composes the latest read of the council and the inbox", () => {
    answer({ key: WORLD.council, proposers: WORLD.proposers }, { proposals: [] });
    const { result } = renderHook(() => useLatestComposedMap(CONFIG));
    expect(result.current.composed).toEqual(expectedMap());
    expect(useProposals).toHaveBeenCalledWith({
      governanceAccountId: CONFIG.governanceAccountId,
      executorContractId: "0.0.5000",
      network: "testnet",
    });
  });

  it("composes nothing until the council is read, and draws no proposals until the inbox is", () => {
    answer(undefined, undefined);
    expect(renderHook(() => useLatestComposedMap(CONFIG)).result.current.composed).toBeNull();
    answer({ key: WORLD.council, proposers: WORLD.proposers }, undefined);
    expect(renderHook(() => useLatestComposedMap(CONFIG)).result.current.composed).toEqual(expectedMap());
  });
});
