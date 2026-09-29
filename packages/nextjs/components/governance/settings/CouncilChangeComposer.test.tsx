import { CouncilChangeComposer } from "./CouncilChangeComposer";
import { SETTINGS_COPY } from "./copy";
import { PrivateKey } from "@hiero-ledger/sdk";
import { memberKeyOfAccount } from "@sh/core/governance/council";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_COPY } from "~~/components/governance/rail/copy";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import type { CouncilQueryData } from "~~/hooks/mirror/useCouncil";
import { type DraftResult, previewDraft } from "~~/services/governance/drafts";

const ecdsa = () => ({ _type: "ECDSA_SECP256K1", key: PrivateKey.generateECDSA().publicKey.toStringRaw() });
const [you, alice, bob, agent] = [ecdsa(), ecdsa(), ecdsa(), ecdsa()];
const seat = (key: { _type: string; key: string }) => memberKeyOfAccount(key) ?? "";
const COUNCIL: CouncilQueryData = {
  key: { threshold: 2, memberKeys: [seat(you), seat(alice), seat(bob)] },
  proposerAccountIds: ["0.0.101", "0.0.102", "0.0.103"],
  proposers: [
    { accountId: "0.0.101", key: seat(you) },
    { accountId: "0.0.102", key: seat(alice) },
    { accountId: "0.0.103", key: seat(bob) },
  ],
  unresolvableProposers: [],
};
const NAMES = { [seat(you)]: { name: "You" }, [seat(alice)]: { name: "Alice" }, [seat(bob)]: { name: "Bob" } };
const CONFIG = { governanceAccountId: "0.0.4000", network: "testnet" } as GovernanceConfig;

// The layout's draft, as the provider would hold it: setDraft stores it, derives the preview and
// re-renders its consumers, as the provider's state change does.
const store = vi.hoisted(() => ({ version: 0, listeners: new Set<() => void>() }));
const wizard = vi.hoisted(() => ({
  draft: { status: "empty" } as DraftResult,
  setDraft: vi.fn(),
  preview: null as unknown,
  submit: vi.fn(),
  submitStatus: "idle",
  submitError: null,
  walletRequest: null,
  lateSubmission: null,
}));
vi.mock("~~/components/governance/wizard/ProposalWizardProvider", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    store.listeners.add(listener);
    return () => {
      store.listeners.delete(listener);
    };
  };
  return {
    useProposalWizard: () => {
      useSyncExternalStore(subscribe, () => store.version);
      return wizard;
    },
  };
});
vi.mock("~~/components/governance/wizard/CouncilPreviewPanel", () => ({
  CouncilPreviewPanel: () => <div>What the council will see</div>,
}));
vi.mock("~~/components/ConnectWallet", () => ({ ConnectWallet: () => <button>Connect</button> }));
const signer = vi.hoisted(() => ({ accountId: "0.0.101" as string | null, isConnected: true, signerKind: "hashpack" }));
vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: () => signer }));
const agentAccount = vi.hoisted(() => ({ data: undefined as unknown, error: null }));
vi.mock("~~/hooks/mirror/useAccount", () => ({ useAccount: () => agentAccount }));

beforeEach(() => {
  wizard.setDraft.mockImplementation((result: DraftResult) => {
    wizard.draft = result;
    wizard.preview = result.status === "ready" ? previewDraft(result.draft) : null;
    store.version += 1;
    store.listeners.forEach(listener => listener());
  });
  Object.assign(signer, { accountId: "0.0.101", isConnected: true });
  agentAccount.data = undefined;
});
afterEach(() => {
  cleanup();
  wizard.setDraft.mockReset();
  wizard.submit.mockReset();
  Object.assign(wizard, { draft: { status: "empty" }, preview: null, submitStatus: "idle" });
});

const naming = (agentSeat: string | null = null) => ({
  proposers: COUNCIL.proposers,
  viewerAccountId: signer.accountId,
  memberNames: NAMES,
  agent: agentSeat ? { accountId: "0.0.600", seat: agentSeat } : null,
});
const renderComposer = (agentSeat: string | null = null) =>
  render(<CouncilChangeComposer council={COUNCIL} naming={naming(agentSeat)} config={CONFIG} />);
const scheduleButton = () => screen.getByRole("button", { name: "Schedule with your wallet" }) as HTMLButtonElement;

describe("CouncilChangeComposer", () => {
  it("offers every seat ticked, the current rule, and nothing to submit until something changes", () => {
    renderComposer();
    expect(screen.getAllByRole("checkbox").map(box => (box as HTMLInputElement).checked)).toEqual([true, true, true]);
    expect(screen.getByText("2-of-3")).toBeTruthy();
    expect(wizard.setDraft).toHaveBeenLastCalledWith({ status: "empty" });
    expect(scheduleButton().disabled).toBe(true);
  });

  it("drafts the change as a rotation when a seat is unticked, tags it, and lets a connected account schedule it", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("checkbox", { name: /Bob/ }));
    expect(screen.getByText(SETTINGS_COPY.composer.tags.leaves)).toBeTruthy();
    expect(screen.getByText("2-of-2")).toBeTruthy();
    expect(wizard.draft).toMatchObject({ status: "ready", draft: { kind: "councilRotation", path: "native" } });
    expect(screen.getByText(SETTINGS_COPY.composer.risks.oneLostKeyFreezes(2))).toBeTruthy();
    expect(screen.getByText("What the council will see")).toBeTruthy();
    expect(scheduleButton().disabled).toBe(false);
  });

  it("schedules through the layout's submit exactly the rotation ticked: the treasury's key, those seats, that threshold", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("checkbox", { name: /Bob/ }));
    fireEvent.click(scheduleButton());
    expect(wizard.submit).toHaveBeenCalledTimes(1);
    if (wizard.draft.status !== "ready") throw new Error("expected a draft");
    const preview = previewDraft(wizard.draft.draft);
    if (preview.path !== "native" || preview.scheduled.kind !== "councilRotation") {
      throw new Error("expected a native rotation");
    }
    expect(preview.kind).toBe("councilRotation");
    expect(preview.scheduled.accountId).toBe(CONFIG.governanceAccountId);
    expect(preview.scheduled.council).toEqual({ threshold: 2, memberKeys: [seat(you), seat(alice)] });
  });

  it("says under the button only what is true until the map draws the draft", () => {
    renderComposer();
    expect(screen.getByText(SETTINGS_COPY.composer.noteWithoutPreview)).toBeTruthy();
    expect(screen.queryByText(SETTINGS_COPY.composer.note)).toBeNull();
  });

  it("offers the co-signing agent unticked while the council does not seat it, and ticking it proposes 2-of-4", () => {
    agentAccount.data = { account: "0.0.600", key: agent };
    renderComposer(seat(agent));
    const agentBox = screen.getByRole("checkbox", { name: new RegExp(AGENT_COPY.name) }) as HTMLInputElement;
    expect(agentBox.checked).toBe(false);
    fireEvent.click(agentBox);
    expect(screen.getByText(SETTINGS_COPY.composer.tags.joins)).toBeTruthy();
    expect(screen.getByText("2-of-4")).toBeTruthy();
    expect(screen.getByText(SETTINGS_COPY.composer.agentAlone(4, 2))).toBeTruthy();
  });

  it("does not offer an agent whose key it could not sign with", () => {
    agentAccount.data = {
      account: "0.0.600",
      key: { _type: "ED25519", key: PrivateKey.generateED25519().publicKey.toStringRaw() },
    };
    renderComposer(seat(agent));
    expect(screen.queryByRole("checkbox", { name: new RegExp(AGENT_COPY.name) })).toBeNull();
  });

  it("moves the threshold within the seats with − and +", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: SETTINGS_COPY.composer.more }));
    expect(screen.getByText("3-of-3")).toBeTruthy();
    expect((screen.getByRole("button", { name: SETTINGS_COPY.composer.more }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("says both councils must reach their thresholds, and that the agent never signs a rotation", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: SETTINGS_COPY.composer.more }));
    expect(screen.getByRole("note").textContent).toBe(SETTINGS_COPY.composer.bothCouncils("2-of-3", "3-of-3"));
    expect(screen.getByText(SETTINGS_COPY.composer.agentNeverSigns)).toBeTruthy();
  });

  it("asks for a wallet instead of scheduling when none is connected", () => {
    Object.assign(signer, { accountId: null, isConnected: false });
    renderComposer();
    fireEvent.click(screen.getByRole("checkbox", { name: /Bob/ }));
    expect(screen.getByText(/Connect a wallet to propose/)).toBeTruthy();
    expect(scheduleButton().disabled).toBe(true);
    fireEvent.click(scheduleButton());
    expect(wizard.submit).not.toHaveBeenCalled();
  });

  it("ignores a draft of another kind that the layout still holds", () => {
    wizard.preview = {
      path: "native",
      kind: "treasuryTransfer",
      target: "x",
      scheduled: { kind: "treasuryTransfer", hbar: [], tokens: [] },
    };
    wizard.setDraft.mockImplementation(() => undefined);
    renderComposer();
    expect(screen.queryByText("What the council will see")).toBeNull();
  });

  it("empties the layout's draft when it unmounts, so the wizard never opens on it", () => {
    const { unmount } = renderComposer();
    fireEvent.click(screen.getByRole("checkbox", { name: /Bob/ }));
    unmount();
    expect(wizard.setDraft).toHaveBeenLastCalledWith({ status: "empty" });
  });
});
