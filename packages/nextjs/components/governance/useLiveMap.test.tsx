import { useLiveMap } from "./useLiveMap";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAP_NODE_STATES } from "~~/components/governance/graph/copy";
import { MAP_SNAPSHOT } from "~~/components/governance/graph/mapFixtures";
import { useSelectedSchedule } from "~~/components/governance/rail/useSelectedSchedule";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { useMapSnapshot } from "~~/hooks/mirror/useMapSnapshot";
import { useToken } from "~~/hooks/mirror/useToken";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { useRemoteApprovals } from "~~/hooks/useRemoteApprovals";
import type { GovernanceSnapshot } from "~~/services/liveMap/events/mapEvents";
import { GOVERNANCE_ACCOUNT_NODE_ID } from "~~/services/liveMap/model/graph";
import { MAP_ENTITY_IDS } from "~~/services/liveMap/model/graphEntities";
import { REST_FRAME } from "~~/services/liveMap/motion/frame";

vi.mock("~~/hooks/mirror/useMapSnapshot", () => ({ useMapSnapshot: vi.fn() }));
vi.mock("~~/hooks/mirror/useToken", () => ({ useToken: vi.fn() }));
vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: vi.fn() }));
vi.mock("~~/hooks/useRemoteApprovals", () => ({ useRemoteApprovals: vi.fn() }));
vi.mock("~~/components/governance/rail/useSelectedSchedule", () => ({ useSelectedSchedule: vi.fn() }));
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

const WORLD: GovernanceSnapshot = {
  council: MAP_SNAPSHOT.council,
  proposers: MAP_SNAPSHOT.proposers,
  proposals: [],
  unreachableProposers: [],
  treasury: { hbarBalanceTinybar: 1, demoTokenBalance: 0, usdcBalance: 0, vaultReserveTinybar: 0n },
  nodeStates: { vaultImplementation: null, tokenPaused: true },
};

const GOVD = { token: { symbol: "GOVD", total_supply: "1000" }, decimals: 0 };

function read(snapshot: GovernanceSnapshot | null) {
  vi.mocked(useMapSnapshot).mockReturnValue({ snapshot, previous: null, events: [], error: null } as never);
}

function selectOnRail(scheduleId: string | null) {
  vi.mocked(useSelectedSchedule).mockReturnValue({ selectedScheduleId: scheduleId, select: vi.fn() });
}

beforeEach(() => {
  read(WORLD);
  vi.mocked(useToken).mockImplementation(tokenId =>
    tokenId === "0.0.6000" ? ({ data: GOVD, isError: false } as never) : ({ data: undefined, isError: true } as never),
  );
  vi.mocked(useHederaSigner).mockReturnValue({ accountId: null } as ReturnType<typeof useHederaSigner>);
  vi.mocked(useRemoteApprovals).mockReset();
  selectOnRail(null);
});

describe("useLiveMap", () => {
  it("draws the strip and the map from one world, at rest while nothing plays", () => {
    const { result } = renderHook(() => useLiveMap({ config: CONFIG }));
    expect(result.current).toMatchObject({
      treasury: WORLD.treasury,
      council: WORLD.council,
      tokens: { governedToken: GOVD, usdc: "unreadable" },
      frame: REST_FRAME,
      error: null,
      inspector: null,
    });
    expect(result.current.map?.graph.nodes.some(({ id }) => id === GOVERNANCE_ACCOUNT_NODE_ID)).toBe(true);
  });

  it("writes the nodes' states into the map's captions", () => {
    const { result } = renderHook(() => useLiveMap({ config: CONFIG }));
    expect(result.current.map?.captions[MAP_ENTITY_IDS.token]).toBe(MAP_NODE_STATES.token.paused);
  });

  it("draws nothing and says no council until the first read", () => {
    read(null);
    const { result } = renderHook(() => useLiveMap({ config: CONFIG }));
    expect(result.current).toMatchObject({ treasury: null, council: null, map: null, frame: REST_FRAME });
  });

  it("explains a selected item, and lets it go when a proposal is selected on the rail", () => {
    const { result, rerender } = renderHook(() => useLiveMap({ config: CONFIG }));
    act(() => result.current.selection.activation.onActivate({ kind: "node", id: GOVERNANCE_ACCOUNT_NODE_ID }));
    expect(result.current.inspector).not.toBeNull();

    selectOnRail("0.0.7001");
    rerender();
    expect(result.current.inspector).toBeNull();
  });

  it("announces a signature this session did not send through the host", () => {
    const onRemoteSignature = vi.fn();
    renderHook(() => useLiveMap({ config: CONFIG, onRemoteSignature }));
    const { onRemote, world } = vi.mocked(useRemoteApprovals).mock.lastCall![0];
    expect(world).toBe(WORLD);
    onRemote({
      kind: "approved",
      scheduleId: "0.0.7001",
      memberKey: MAP_SNAPSHOT.council.memberKeys[0],
      at: "1790000000.000000000",
    });
    expect(onRemoteSignature).toHaveBeenCalledWith(expect.any(String));
  });
});
