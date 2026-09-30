import { captionFactsOf, useMapPreview } from "./useMapPreview";
import { PrivateKey } from "@hiero-ledger/sdk";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { draftCouncilRotation, draftTreasuryTransfer, previewDraft } from "~~/services/governance/drafts";
import { GOVERNANCE, SUPPLIER, UPGRADE_CALL, proposal } from "~~/services/liveMap/motion/motionFixtures";
import { draftPreviewOf, selectedPreviewOf, sketchPreviewOf } from "~~/services/liveMap/preview/previewSource";

const route = vi.hoisted(() => ({
  pathname: "/",
  params: {} as Record<string, string>,
  selected: null as string | null,
}));
const wizard = vi.hoisted(() => ({ preview: null as unknown, kind: "upgrade" }));
const lookup = vi.hoisted(() => ({ proposal: undefined as unknown, scheduleIds: [] as string[] }));

vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useParams: () => route.params }));
vi.mock("~~/components/governance/rail/useSelectedSchedule", () => ({
  useSelectedSchedule: () => ({ selectedScheduleId: route.selected, select: vi.fn() }),
}));
vi.mock("~~/components/governance/wizard/ProposalWizardProvider", () => ({
  useProposalWizard: () => ({ preview: wizard.preview, kind: wizard.kind }),
}));
vi.mock("~~/hooks/useCoSigningAgent", () => ({ useCoSigningAgent: () => null }));
vi.mock("~~/hooks/scaffold-hbar", () => ({ useTargetNetwork: () => ({ targetNetwork: { id: 296 } }) }));
vi.mock("~~/utils/scaffold-hbar/contract", () => ({ contracts: {} }));
vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: () => ({ accountId: "0.0.4101" }) }));
vi.mock("~~/hooks/mirror/useProposalLookup", () => ({
  useProposalLookup: ({ scheduleId }: { scheduleId: string }) => {
    lookup.scheduleIds.push(scheduleId);
    return { proposal: lookup.proposal };
  },
}));

const CONFIG = {
  governanceAccountId: GOVERNANCE,
  network: "testnet",
  demoTokenId: "0.0.6000",
  executor: { hederaContractId: "0.0.5000", address: "0x5aF0000000000000000000000000000000000000" },
  vault: { hederaContractId: "0.0.5001", address: "0x3f806946439c3521eeD7d740c3f84E09888C0419" },
} as unknown as GovernanceConfig;

beforeEach(() => {
  Object.assign(route, { pathname: "/", params: {}, selected: null });
  wizard.preview = null;
  wizard.kind = "upgrade";
  lookup.proposal = undefined;
  lookup.scheduleIds = [];
});

describe("useMapPreview", () => {
  it("previews the proposal ?schedule= selects on /, and names it in the caption", () => {
    route.selected = "0.0.9001";
    lookup.proposal = proposal({ id: "0.0.9001", operation: UPGRADE_CALL });
    const { result } = renderHook(() => useMapPreview(CONFIG));
    expect(lookup.scheduleIds.at(-1)).toBe("0.0.9001");
    expect(result.current.preview?.mode).toBe("live");
    expect(result.current.target).toEqual({ kind: "schedule", scheduleId: "0.0.9001" });
    expect(result.current.title).toBe("Upgrade the vault to v2");
    expect(result.current.targetKey).toBe("schedule:0.0.9001");
  });

  it("previews the wizard's draft on its route and asks for no proposal", () => {
    route.pathname = "/governance/new";
    wizard.preview = previewDraft(draftTreasuryTransfer(GOVERNANCE, { recipientAccountId: SUPPLIER, amount: "40" }));
    const { result } = renderHook(() => useMapPreview(CONFIG));
    expect(lookup.scheduleIds.filter(Boolean)).toEqual([]);
    expect(result.current.preview?.key).toBe("draft:treasuryTransfer");
    expect(result.current.target).toEqual({ kind: "draft" });
    expect(result.current.title).toBe("Pay a supplier");
  });

  it("sketches the picked kind's way through the configured vault until the form holds a draft", () => {
    route.pathname = "/governance/new";
    const { result } = renderHook(() => useMapPreview(CONFIG));
    expect(result.current.preview?.key).toBe("draft:upgrade");
    expect(result.current.preview?.operation).toMatchObject({
      kind: "sketch",
      of: "upgrade",
      refs: { subject: ["0.0.5001"] },
    });
    expect(result.current.title).toBe("Upgrade the vault to v2");
  });

  it("draws no preview for a draft the decoders cannot describe, and only asks for the form", () => {
    route.pathname = "/governance/new";
    wizard.kind = "treasuryTransfer";
    wizard.preview = { kind: "treasuryTransfer", path: "native", scheduled: { kind: "unrecognized", reason: "test" } };
    const { result } = renderHook(() => useMapPreview(CONFIG));
    expect(result.current.preview).toBeNull();
    expect(result.current.title).toBe("Pay a supplier");
  });

  it("previews the layout's council change on Settings and captions the council it would create", () => {
    route.pathname = "/settings";
    route.selected = "0.0.9001";
    wizard.preview = previewDraft(
      draftCouncilRotation(
        { governanceAccountId: GOVERNANCE },
        { memberKeys: Array.from({ length: 4 }, () => PrivateKey.generateED25519().publicKey), threshold: 2 },
      ),
    );
    const { result } = renderHook(() => useMapPreview(CONFIG));
    expect(lookup.scheduleIds.filter(Boolean)).toEqual([]);
    expect(result.current.target).toEqual({ kind: "councilSettings" });
    expect(result.current.targetKey).toBe("councilSettings");
    expect(result.current.preview?.key).toBe("draft:councilRotation");
    expect(captionFactsOf(result.current.target, result.current.preview, result.current.title)).toEqual({
      kind: "councilSettings",
      rule: "2-of-4",
    });
  });

  it("draws nothing on Settings for a draft of another kind, and captions the council at rest", () => {
    route.pathname = "/settings";
    wizard.preview = previewDraft(draftTreasuryTransfer(GOVERNANCE, { recipientAccountId: SUPPLIER, amount: "40" }));
    const { result } = renderHook(() => useMapPreview(CONFIG));
    expect(result.current.preview).toBeNull();
    expect(captionFactsOf(result.current.target, result.current.preview, result.current.title)).toEqual({
      kind: "councilSettings",
      rule: null,
    });
  });

  it("shows nothing for a selection it could not read", () => {
    route.selected = "0.0.404";
    const { result } = renderHook(() => useMapPreview(CONFIG));
    expect(result.current.preview).toBeNull();
    expect(result.current.title).toBeNull();
  });
});

describe("captionFactsOf", () => {
  it("tells a drawn draft from a drawn sketch of the picked kind", () => {
    const draft = draftPreviewOf(
      previewDraft(draftTreasuryTransfer(GOVERNANCE, { recipientAccountId: SUPPLIER, amount: "40" })),
      null,
    );
    const sketch = sketchPreviewOf("upgrade", { governanceAccountId: GOVERNANCE, entities: [], agentSeat: null }, null);
    expect(captionFactsOf({ kind: "draft" }, draft, "Pay a supplier")).toEqual({
      kind: "drafting",
      title: "Pay a supplier",
    });
    expect(captionFactsOf({ kind: "draft" }, sketch, "Upgrade the vault to v2")).toEqual({
      kind: "sketching",
      title: "Upgrade the vault to v2",
    });
  });

  it("asks for a kind only before one is picked, for the form once one is, and falls back to idle for an undescribable selection", () => {
    expect(captionFactsOf({ kind: "draft" }, null, null)).toEqual({ kind: "drafting", title: null });
    expect(captionFactsOf({ kind: "draft" }, null, "Pay a supplier")).toEqual({
      kind: "picked",
      title: "Pay a supplier",
    });
    expect(captionFactsOf({ kind: "schedule", scheduleId: "0.0.1" }, null, "Run entry 3")).toEqual({ kind: "idle" });
    const selected = selectedPreviewOf(proposal({ id: "0.0.2", operation: UPGRADE_CALL }), 1);
    expect(captionFactsOf({ kind: "schedule", scheduleId: "0.0.2" }, selected, "Upgrade the vault to v2")).toEqual({
      kind: "previewing",
      title: "Upgrade the vault to v2",
    });
    const executed = selectedPreviewOf(proposal({ id: "0.0.2", operation: UPGRADE_CALL }), 0);
    expect(
      captionFactsOf(
        { kind: "schedule", scheduleId: "0.0.2" },
        executed && { ...executed, mode: "history" },
        "Upgrade the vault to v2",
      ),
    ).toEqual({ kind: "history", title: "Upgrade the vault to v2" });
  });
});
