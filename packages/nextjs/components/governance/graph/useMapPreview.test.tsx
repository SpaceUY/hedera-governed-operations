import { captionFactsOf, useMapPreview } from "./useMapPreview";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { draftTreasuryTransfer, previewDraft } from "~~/services/governance/drafts";
import { GOVERNANCE, SUPPLIER, UPGRADE_CALL, proposal } from "~~/services/liveMap/motion/motionFixtures";
import { selectedPreviewOf } from "~~/services/liveMap/preview/previewSource";

const route = vi.hoisted(() => ({
  pathname: "/",
  params: {} as Record<string, string>,
  selected: null as string | null,
}));
const wizard = vi.hoisted(() => ({ preview: null as unknown }));
const lookup = vi.hoisted(() => ({ proposal: undefined as unknown, scheduleIds: [] as string[] }));

vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useParams: () => route.params }));
vi.mock("~~/components/governance/rail/useSelectedSchedule", () => ({
  useSelectedSchedule: () => ({ selectedScheduleId: route.selected, select: vi.fn() }),
}));
vi.mock("~~/components/governance/wizard/ProposalWizardProvider", () => ({
  useProposalWizard: () => ({ preview: wizard.preview }),
}));
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
  executor: { hederaContractId: "0.0.5000", address: "0x5aF0000000000000000000000000000000000000" },
} as unknown as GovernanceConfig;

beforeEach(() => {
  Object.assign(route, { pathname: "/", params: {}, selected: null });
  wizard.preview = null;
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
    expect(result.current.caption).toEqual({ kind: "previewing", title: "Upgrade the vault to v2" });
    expect(result.current.targetKey).toBe("schedule:0.0.9001");
  });

  it("previews the wizard's draft on its route and asks for no proposal", () => {
    route.pathname = "/governance/new";
    wizard.preview = previewDraft(draftTreasuryTransfer(GOVERNANCE, { recipientAccountId: SUPPLIER, amount: "40" }));
    const { result } = renderHook(() => useMapPreview(CONFIG));
    expect(lookup.scheduleIds.at(-1)).toBe("");
    expect(result.current.preview?.key).toBe("draft:treasuryTransfer");
    expect(result.current.caption).toEqual({ kind: "drafting", title: "Pay a supplier" });
  });

  it("shows nothing for a selection it could not read", () => {
    route.selected = "0.0.404";
    const { result } = renderHook(() => useMapPreview(CONFIG));
    expect(result.current.preview).toBeNull();
    expect(result.current.caption).toEqual({ kind: "idle" });
  });
});

describe("captionFactsOf", () => {
  it("asks for a kind while the wizard has nothing drawable, and falls back to idle for an undescribable selection", () => {
    expect(captionFactsOf({ kind: "draft" }, null, "Pay a supplier")).toEqual({ kind: "drafting", title: null });
    expect(captionFactsOf({ kind: "schedule", scheduleId: "0.0.1" }, null, "Run entry 3")).toEqual({ kind: "idle" });
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
