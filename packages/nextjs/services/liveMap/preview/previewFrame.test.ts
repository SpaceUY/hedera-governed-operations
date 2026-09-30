import type { PreviewContext } from "./kinds/previewKind";
import { paneFrameOf, previewFrameOf } from "./previewFrame";
import { type MapPreview, selectedPreviewOf } from "./previewSource";
import type { Proposal } from "@sh/core/governance/proposals";
import { describe, expect, it } from "vitest";
import {
  EXECUTOR_NODE_ID,
  GOVERNANCE_ACCOUNT_NODE_ID,
  deriveGraphState,
  edgeId,
  externalNodeId,
  memberNodeId,
} from "~~/services/liveMap/model/graph";
import { REST_FRAME } from "~~/services/liveMap/motion/frame";
import {
  ALICE,
  BOB,
  CAROL,
  SUCCEEDED,
  SUPPLIER,
  TRANSFER,
  UPGRADE_CALL,
  ago,
  graphOf,
  proposal,
  world,
} from "~~/services/liveMap/motion/motionFixtures";

const CONTEXT: PreviewContext = {
  council: { threshold: 2, memberKeys: [ALICE, BOB, CAROL] },
  vaultReleaseOf: implementation => (implementation === "0x0000000000000000000000000000000000a2d434" ? "next" : null),
  tokenOf: () => null,
};

const TO_REGISTRY = edgeId(GOVERNANCE_ACCOUNT_NODE_ID, EXECUTOR_NODE_ID);
const TO_VAULT = edgeId(EXECUTOR_NODE_ID, "vault");
const ALICE_ARC = edgeId(memberNodeId(ALICE), EXECUTOR_NODE_ID);

const pendingUpgrade = proposal({ id: "0.0.9001", operation: UPGRADE_CALL, signatures: [[ALICE, ago(20)]] });
const SHOWN = world([pendingUpgrade]);
const GRAPH = graphOf(SHOWN);
const upgradePreview = selectedPreviewOf(pendingUpgrade, 1) as MapPreview;

describe("previewFrameOf", () => {
  it("draws the upgrade's path dashed, keeps its route, the council and the proposer's arc in scope, and names the vault", () => {
    const frame = previewFrameOf(upgradePreview, { graph: GRAPH, world: SHOWN, context: CONTEXT });
    expect(frame.phases).toEqual({ [TO_REGISTRY]: "preview", [TO_VAULT]: "preview" });
    expect(frame.scope?.edgeIds).toEqual(expect.arrayContaining([TO_REGISTRY, TO_VAULT, ALICE_ARC]));
    expect(frame.scope?.nodeIds).toEqual(
      expect.arrayContaining([GOVERNANCE_ACCOUNT_NODE_ID, EXECUTOR_NODE_ID, "vault", memberNodeId(BOB)]),
    );
    expect(frame.labels).toEqual({ vault: "would become v2" });
    expect(frame.ring).toEqual({ signed: 1, snap: false, tone: null, need: 1 });
    expect(frame.drawKey).toBe("schedule:0.0.9001");
  });

  it("previews a drafted payment to an account the map did not have, with no registry arc", () => {
    const draft: MapPreview = {
      key: "draft:treasuryTransfer",
      operation: TRANSFER as MapPreview["operation"],
      mode: "live",
      proposerAccountId: "0.0.4101",
      progress: null,
    };
    const graph = graphOf(world([]), draft.operation);
    const frame = previewFrameOf(draft, { graph, world: world([]), context: CONTEXT });
    const toSupplier = edgeId(GOVERNANCE_ACCOUNT_NODE_ID, externalNodeId(SUPPLIER));
    expect(frame.phases).toEqual({ [toSupplier]: "preview" });
    expect(frame.scope?.edgeIds).not.toContain(ALICE_ARC);
    expect(frame.labels).toEqual({ [externalNodeId(SUPPLIER)]: "would receive 40 ℏ" });
    expect(frame.ring).toBeNull();
  });

  it("draws nothing and dims nothing when the drawn graph cannot complete the route", () => {
    const withoutVault = deriveGraphState({
      governanceAccountId: "0.0.4000",
      executor: { ref: "0.0.5000" },
      council: SHOWN.council,
      proposers: SHOWN.proposers,
      entities: [],
      proposals: [],
    });
    expect(previewFrameOf(upgradePreview, { graph: withoutVault, world: SHOWN, context: CONTEXT })).toBe(REST_FRAME);
    expect(previewFrameOf(null, { graph: GRAPH, world: SHOWN, context: CONTEXT })).toBe(REST_FRAME);
  });

  it("shows an executed proposal's path in mint with its target lit and a full ring, without words", () => {
    const executed = proposal({ id: "0.0.9002", operation: TRANSFER, executedAt: ago(1), execution: SUCCEEDED });
    const preview = selectedPreviewOf(executed, 0) as MapPreview;
    const graph = graphOf(world([executed]), preview.operation);
    const frame = previewFrameOf(preview, { graph, world: world([executed]), context: CONTEXT });
    expect(Object.values(frame.phases)).toEqual(["complete"]);
    expect(frame.highlights).toEqual({ [externalNodeId(SUPPLIER)]: "success" });
    expect(frame.ring).toEqual({ signed: 2, snap: false, tone: "success" });
    expect(frame.labels).toEqual({});
    expect(frame.drawKey).toBeNull();
  });

  it("shows a withdrawn proposal's path as muted dashes", () => {
    const withdrawn: Proposal = {
      ...pendingUpgrade,
      state: { ...pendingUpgrade.state, status: "deleted", isSettled: true },
    };
    const preview = selectedPreviewOf(withdrawn, 1) as MapPreview;
    const frame = previewFrameOf(preview, { graph: GRAPH, world: SHOWN, context: CONTEXT });
    expect(frame.phases).toEqual({ [TO_REGISTRY]: "void", [TO_VAULT]: "void" });
    expect(frame.ring).toBeNull();
  });
});

describe("paneFrameOf", () => {
  it("a playing sequence wins over the preview, which returns once it has played", () => {
    const worlds = { graph: GRAPH, world: SHOWN, context: CONTEXT };
    const playing = {
      event: { kind: "executed" as const, scheduleId: "0.0.9001", at: ago(1) },
      cue: { name: "thresholdPause" as const },
      world: SHOWN,
    };
    const during = paneFrameOf(playing, upgradePreview, worlds);
    expect(during.scope).toBeNull();
    expect(during.phases[TO_REGISTRY]).toBeUndefined();
    expect(paneFrameOf(null, upgradePreview, worlds).scope).not.toBeNull();
  });
});
