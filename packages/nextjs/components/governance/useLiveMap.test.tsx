import { useLiveMap } from "./useLiveMap";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAP_NODE_STATES } from "~~/components/governance/graph/copy";
import { MAP_SNAPSHOT } from "~~/components/governance/graph/mapFixtures";
import { useMapPreview } from "~~/components/governance/graph/useMapPreview";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { useMapSnapshot } from "~~/hooks/mirror/useMapSnapshot";
import { useToken } from "~~/hooks/mirror/useToken";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { useProposalAnimationSync } from "~~/hooks/useProposalAnimationSync";
import { useRemoteApprovals } from "~~/hooks/useRemoteApprovals";
import type { GovernanceSnapshot } from "~~/services/liveMap/events/mapEvents";
import { GOVERNANCE_ACCOUNT_NODE_ID } from "~~/services/liveMap/model/graph";
import { MAP_ENTITY_IDS, governanceEntitiesOf } from "~~/services/liveMap/model/graphEntities";
import { REST_FRAME } from "~~/services/liveMap/motion/frame";
import { type MapPreview, type PreviewTarget, sketchPreviewOf } from "~~/services/liveMap/preview/previewSource";

vi.mock("~~/hooks/mirror/useMapSnapshot", () => ({ useMapSnapshot: vi.fn() }));
vi.mock("~~/hooks/mirror/useToken", () => ({ useToken: vi.fn() }));
vi.mock("~~/hooks/useCoSigningAgent", () => ({ useCoSigningAgent: () => null }));
vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: vi.fn() }));
vi.mock("~~/hooks/useProposalAnimationSync", async importOriginal => {
  const original = await importOriginal<typeof import("~~/hooks/useProposalAnimationSync")>();
  return { useProposalAnimationSync: vi.fn(original.useProposalAnimationSync) };
});
vi.mock("~~/hooks/useRemoteApprovals", () => ({ useRemoteApprovals: vi.fn() }));
vi.mock("~~/components/governance/graph/useMapPreview", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/components/governance/graph/useMapPreview")>()),
  useMapPreview: vi.fn(),
}));
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

const GOVD = { token: { symbol: "GOVD" }, decimals: 0 };

function read(snapshot: GovernanceSnapshot | null) {
  vi.mocked(useMapSnapshot).mockReturnValue({ snapshot, previous: null, events: [], error: null } as never);
}

const NO_TARGET = { target: { kind: "none" }, targetKey: "none" } as const;
const DRAFT = { target: { kind: "draft" }, targetKey: "draft" } as const;
const SELECTED = { target: { kind: "schedule", scheduleId: "0.0.7001" }, targetKey: "schedule:0.0.7001" } as const;

type Shown = { target: PreviewTarget; targetKey: string };

function previewing(shown: Shown, preview: MapPreview | null = null, title: string | null = null) {
  vi.mocked(useMapPreview).mockReturnValue({ ...shown, preview, title });
}

const TRANSFER_PREVIEW = (key: string, payerAccountId: string): MapPreview => ({
  key,
  operation: {
    kind: "treasuryTransfer",
    hbar: [
      { accountId: payerAccountId, tinybars: -100n },
      { accountId: "0.0.7100", tinybars: 100n },
    ],
    tokens: [],
  },
  mode: "live",
  proposerAccountId: null,
  progress: null,
});

beforeEach(() => {
  read(WORLD);
  vi.mocked(useToken).mockImplementation(tokenId =>
    tokenId === "0.0.6000" ? ({ data: GOVD, isError: false } as never) : ({ data: undefined, isError: true } as never),
  );
  vi.mocked(useHederaSigner).mockReturnValue({ accountId: null } as ReturnType<typeof useHederaSigner>);
  vi.mocked(useRemoteApprovals).mockReset();
  previewing(NO_TARGET);
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

  it("explains a selected item, and lets it go when the map starts showing something else", () => {
    const { result, rerender } = renderHook(() => useLiveMap({ config: CONFIG }));
    act(() => result.current.selection.activation.onActivate({ kind: "node", id: GOVERNANCE_ACCOUNT_NODE_ID }));
    expect(result.current.inspector).not.toBeNull();

    previewing(SELECTED);
    rerender();
    expect(result.current.inspector).toBeNull();
  });

  it("says the idle caption with the council's rule once there is a world", () => {
    const { result } = renderHook(() => useLiveMap({ config: CONFIG }));
    expect(result.current.caption?.lead).toBe("Nothing moves until the 2-of-3 council signs.");
  });

  it("draws the previewed operation's route into the map and the frame, and its caption follows the preview", () => {
    previewing(DRAFT, TRANSFER_PREVIEW("draft:treasuryTransfer", CONFIG.governanceAccountId), "Pay a supplier");
    const { result } = renderHook(() => useLiveMap({ config: CONFIG }));
    expect(result.current.frame.drawKey).toBe("draft:treasuryTransfer");
    expect(result.current.caption?.lead).toBe("Drafting.");
  });

  describe("while a sequence plays", () => {
    const PLAYING = {
      event: { kind: "councilChanged" },
      cue: { name: "hold", ms: 0 },
      world: WORLD,
    } as never;

    afterEach(() => vi.mocked(useProposalAnimationSync).mockRestore());

    it("holds the preview back: the map and frame are the sequence's, and the caption is the draft's without a path", () => {
      const rest = renderHook(() => useLiveMap({ config: CONFIG })).result.current;
      previewing(DRAFT, TRANSFER_PREVIEW("draft:treasuryTransfer", CONFIG.governanceAccountId), "Pay a supplier");
      vi.mocked(useProposalAnimationSync).mockReturnValue({ world: WORLD, playing: PLAYING } as never);

      const { result } = renderHook(() => useLiveMap({ config: CONFIG }));
      expect(result.current.map?.graph).toEqual(rest.map?.graph);
      expect(result.current.frame.drawKey).toBeNull();
      expect(result.current.frame.highlights).toEqual({ [GOVERNANCE_ACCOUNT_NODE_ID]: "success" });
      expect(result.current.caption).toEqual({
        lead: "Drafting.",
        text: "Fill in the form to see where “Pay a supplier” would go.",
      });
    });

    it("says the idle caption for a selected proposal while a sequence plays", () => {
      previewing(SELECTED, TRANSFER_PREVIEW("schedule:0.0.7001", CONFIG.governanceAccountId), "Pay a supplier");
      vi.mocked(useProposalAnimationSync).mockReturnValue({ world: WORLD, playing: PLAYING } as never);
      const { result } = renderHook(() => useLiveMap({ config: CONFIG }));
      expect(result.current.caption?.lead).toBe("Nothing moves until the 2-of-3 council signs.");
    });
  });

  it("says the idle caption when the previewed operation's route cannot be drawn, so no words describe a missing path", () => {
    previewing(SELECTED, TRANSFER_PREVIEW("schedule:0.0.7001", "0.0.9999"), "Pay a supplier");
    const { result } = renderHook(() => useLiveMap({ config: CONFIG }));
    expect(result.current.frame).toBe(REST_FRAME);
    expect(result.current.caption?.lead).toBe("Nothing moves until the 2-of-3 council signs.");
  });

  it("says the draft's caption without a path when the drafted operation's route cannot be drawn", () => {
    previewing(DRAFT, TRANSFER_PREVIEW("draft", "0.0.9999"), "Pay a supplier");
    const { result } = renderHook(() => useLiveMap({ config: CONFIG }));
    expect(result.current.frame).toBe(REST_FRAME);
    expect(result.current.caption).toEqual({
      lead: "Drafting.",
      text: "Fill in the form to see where “Pay a supplier” would go.",
    });
  });

  it("draws a picked kind's way before its form is filled, and says so", () => {
    const sketch = sketchPreviewOf(
      "upgrade",
      { governanceAccountId: CONFIG.governanceAccountId, entities: governanceEntitiesOf(CONFIG, 296), agentSeat: null },
      null,
    );
    previewing(DRAFT, sketch, "Upgrade the vault to v2");
    const { result } = renderHook(() => useLiveMap({ config: CONFIG }));
    expect(result.current.frame.drawKey).toBe("draft:upgrade");
    expect(result.current.frame.labels).toEqual({ [MAP_ENTITY_IDS.vault]: "would be upgraded" });
    expect(result.current.caption).toEqual({
      lead: "Drafting.",
      text: "Dashed violet is the way “Upgrade the vault to v2” would go. Fill in the form to see exactly what it would do.",
    });
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
