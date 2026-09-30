import { CouncilChangeComposer } from "./CouncilChangeComposer";
import { SETTINGS_COPY } from "./copy";
import type { UnseatedAgent } from "./useUnseatedAgent";
import { PrivateKey } from "@hiero-ledger/sdk";
import { memberKeyOfAccount } from "@sh/core/governance/council";
import type { MirrorAccount } from "@sh/core/mirror";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_COPY } from "~~/components/governance/rail/copy";
import { agentSeatOf } from "~~/components/governance/wizard/kinds/coSigningAgent/agentSeat";
import { CO_SIGNING_AGENT_COPY } from "~~/components/governance/wizard/kinds/coSigningAgent/copy";
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
// What the Mirror Node answers for each typed account; anything else reads as not known yet.
const mirrorAccounts = vi.hoisted(() => ({ byInput: {} as Record<string, unknown> }));
vi.mock("~~/hooks/mirror/useAccounts", () => ({
  useAccounts: (inputs: string[]) =>
    inputs.map(input => ({ account: mirrorAccounts.byInput[input.trim()], error: null, isLoading: false })),
}));
// The connected account as the Mirror Node reads it, for the seat its key holds.
const viewerAccounts = vi.hoisted(() => ({ byId: {} as Record<string, unknown> }));
vi.mock("~~/hooks/mirror/useAccount", () => ({
  useAccount: (id: string | null) => ({ data: id ? viewerAccounts.byId[id] : undefined }),
}));
vi.mock("~~/hooks/scaffold-hbar", () => ({ useTargetNetwork: () => ({ targetNetwork: { id: 296 } }) }));
vi.mock("@scaffold-hbar-ui/components", () => ({
  HederaAddressInput: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input value={value} onChange={event => onChange(event.target.value)} />
  ),
}));

beforeEach(() => {
  wizard.setDraft.mockImplementation((result: DraftResult) => {
    wizard.draft = result;
    wizard.preview = result.status === "ready" ? previewDraft(result.draft) : null;
    store.version += 1;
    store.listeners.forEach(listener => listener());
  });
  Object.assign(signer, { accountId: "0.0.101", isConnected: true });
  mirrorAccounts.byInput = {};
  viewerAccounts.byId = { "0.0.101": { account: "0.0.101", key: you } };
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
type MirrorKey = { _type: string; key: string };
/** The agent as the page checks it, holding `key` on account 0.0.600 while the council does not seat it. */
const unseated = (key: MirrorKey): UnseatedAgent => ({
  seat: seat(key),
  check: agentSeatOf("0.0.600", { account: { account: "0.0.600", key } as MirrorAccount, error: null }, COUNCIL.key),
});
const renderComposer = (agentKey: MirrorKey | null = null) =>
  render(
    <CouncilChangeComposer
      council={COUNCIL}
      naming={naming(agentKey ? seat(agentKey) : null)}
      config={CONFIG}
      unseatedAgent={agentKey ? unseated(agentKey) : null}
    />,
  );
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

  it("says under the button that the map shows the council the change would create", () => {
    renderComposer();
    expect(screen.getByText(SETTINGS_COPY.composer.note)).toBeTruthy();
  });

  it("offers the co-signing agent unticked while the council does not seat it, and ticking it proposes 2-of-4", () => {
    renderComposer(agent);
    const agentBox = screen.getByRole("checkbox", { name: new RegExp(AGENT_COPY.name) }) as HTMLInputElement;
    expect(agentBox.checked).toBe(false);
    fireEvent.click(agentBox);
    expect(screen.getByText(SETTINGS_COPY.composer.tags.joins)).toBeTruthy();
    expect(screen.getByText("2-of-4")).toBeTruthy();
    expect(screen.getByText(SETTINGS_COPY.composer.agentAlone(4, 2))).toBeTruthy();
  });

  it("does not offer an agent whose key it could not sign with, and says why", () => {
    renderComposer({ _type: "ED25519", key: PrivateKey.generateED25519().publicKey.toStringRaw() });
    expect(screen.queryByRole("checkbox", { name: new RegExp(AGENT_COPY.name) })).toBeNull();
    expect(screen.getByText(CO_SIGNING_AGENT_COPY.notEcdsa("0.0.600", "ED25519"))).toBeTruthy();
  });

  it("refuses to schedule a council the others cannot reach without the agent, which never signs a rotation", () => {
    renderComposer(agent);
    fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(AGENT_COPY.name) }));
    const more = screen.getByRole("button", { name: SETTINGS_COPY.composer.more });
    fireEvent.click(more);
    expect(screen.queryByText(SETTINGS_COPY.composer.agentBlocks(3, "3-of-4"))).toBeNull();
    expect(scheduleButton().disabled).toBe(false);
    fireEvent.click(more);
    expect(screen.getByText(SETTINGS_COPY.composer.agentBlocks(3, "4-of-4"))).toBeTruthy();
    expect(scheduleButton().disabled).toBe(true);
  });

  it("refuses you and the agent at 2-of-2: the agent never signs, so you alone can't reach it", () => {
    renderComposer(agent);
    fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(AGENT_COPY.name) }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Alice/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Bob/ }));
    expect(screen.getByText("2-of-2")).toBeTruthy();
    expect(screen.getByText(SETTINGS_COPY.composer.agentBlocks(1, "2-of-2"))).toBeTruthy();
    expect(scheduleButton().disabled).toBe(true);
    fireEvent.click(scheduleButton());
    expect(wizard.submit).not.toHaveBeenCalled();
  });

  it("warns a council member who does not propose that they would leave, without saying they keep PROPOSER_ROLE", () => {
    Object.assign(signer, { accountId: "0.0.900" });
    viewerAccounts.byId["0.0.900"] = { account: "0.0.900", key: bob };
    renderComposer(agent);
    fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(AGENT_COPY.name) }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Bob/ }));
    expect(screen.getByText(SETTINGS_COPY.composer.risks.viewerLeaves(false))).toBeTruthy();
  });

  it("tells a proposer who unticks their own seat that they keep PROPOSER_ROLE", () => {
    renderComposer(agent);
    fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(AGENT_COPY.name) }));
    fireEvent.click(screen.getByRole("checkbox", { name: /You/ }));
    expect(screen.getByText(SETTINGS_COPY.composer.risks.viewerLeaves(true))).toBeTruthy();
  });

  it("warns, without blocking, when the current council needs the agent's seat to reach its threshold", () => {
    const stuck: CouncilQueryData = { ...COUNCIL, key: { threshold: 2, memberKeys: [seat(you), seat(agent)] } };
    render(<CouncilChangeComposer council={stuck} naming={naming(seat(agent))} config={CONFIG} unseatedAgent={null} />);
    expect(screen.getByText(SETTINGS_COPY.composer.agentHoldsCouncil(1, "2-of-2"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: SETTINGS_COPY.composer.fewer }));
    expect(scheduleButton().disabled).toBe(false);
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
    fireEvent.click(screen.getByRole("checkbox", { name: /Bob/ }));
    expect(screen.getByText(SETTINGS_COPY.composer.tags.leaves)).toBeTruthy();
    expect(screen.queryByText("What the council will see")).toBeNull();
  });

  it("seats an account that holds no seat yet: its row adds a ticked seat that joins, 2-of-3 becoming 2-of-4", () => {
    const newcomer = ecdsa();
    mirrorAccounts.byInput["0.0.700"] = { account: "0.0.700", key: newcomer };
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: SETTINGS_COPY.composer.members.addMember }));
    fireEvent.change(screen.getByRole("textbox", { name: SETTINGS_COPY.composer.members.memberLabel(1) }), {
      target: { value: "0.0.700" },
    });

    const joining = screen.getByRole("checkbox", { name: /0\.0\.700/ }) as HTMLInputElement;
    expect(joining.checked).toBe(true);
    expect(screen.getByText(SETTINGS_COPY.composer.tags.joins)).toBeTruthy();
    expect(screen.getByText("2-of-4")).toBeTruthy();
    if (wizard.draft.status !== "ready") throw new Error("expected a draft");
    const preview = previewDraft(wizard.draft.draft);
    if (preview.path !== "native" || preview.scheduled.kind !== "councilRotation") {
      throw new Error("expected a native rotation");
    }
    expect(preview.scheduled.council).toEqual({
      threshold: 2,
      memberKeys: [seat(you), seat(alice), seat(bob), seat(newcomer)],
    });

    fireEvent.click(joining);
    expect(screen.getByText("2-of-3")).toBeTruthy();
    expect(wizard.draft).toEqual({ status: "empty" });
  });

  it("drops the seat of a row that is removed", () => {
    mirrorAccounts.byInput["0.0.700"] = { account: "0.0.700", key: ecdsa() };
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: SETTINGS_COPY.composer.members.addMember }));
    fireEvent.change(screen.getByRole("textbox", { name: SETTINGS_COPY.composer.members.memberLabel(1) }), {
      target: { value: "0.0.700" },
    });
    fireEvent.click(screen.getByRole("button", { name: SETTINGS_COPY.composer.members.removeMember(1) }));
    expect(screen.queryByRole("checkbox", { name: /0\.0\.700/ })).toBeNull();
    expect(screen.getByText("2-of-3")).toBeTruthy();
    expect(wizard.draft).toEqual({ status: "empty" });
  });

  it("says a row's account already holds a seat listed above, and adds nothing", () => {
    mirrorAccounts.byInput["0.0.102"] = { account: "0.0.102", key: alice };
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: SETTINGS_COPY.composer.members.addMember }));
    fireEvent.change(screen.getByRole("textbox", { name: SETTINGS_COPY.composer.members.memberLabel(1) }), {
      target: { value: "0.0.102" },
    });
    expect(screen.getByText(SETTINGS_COPY.composer.members.alreadyOffered("0.0.102"))).toBeTruthy();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.getByText("2-of-3")).toBeTruthy();
  });

  it("refuses an account whose key is not a single key", () => {
    mirrorAccounts.byInput["0.0.800"] = { account: "0.0.800", key: { _type: "ProtobufEncoded", key: "0a05" } };
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: SETTINGS_COPY.composer.members.addMember }));
    fireEvent.change(screen.getByRole("textbox", { name: SETTINGS_COPY.composer.members.memberLabel(1) }), {
      target: { value: "0.0.800" },
    });
    expect(screen.getByText(SETTINGS_COPY.composer.members.notSingleKey("0.0.800", "ProtobufEncoded"))).toBeTruthy();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("holds the change back while a row is empty, and says to fill it in or remove it", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("checkbox", { name: /Bob/ }));
    fireEvent.click(screen.getByRole("button", { name: SETTINGS_COPY.composer.members.addMember }));
    expect(screen.getByText(SETTINGS_COPY.composer.members.emptyMember(1))).toBeTruthy();
    expect(wizard.draft).toEqual({ status: "empty" });
    expect(scheduleButton().disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: SETTINGS_COPY.composer.members.removeMember(1) }));
    expect(wizard.draft).toMatchObject({ status: "ready" });
  });

  it("empties the layout's draft when it unmounts, so the wizard never opens on it", () => {
    const { unmount } = renderComposer();
    fireEvent.click(screen.getByRole("checkbox", { name: /Bob/ }));
    unmount();
    expect(wizard.setDraft).toHaveBeenLastCalledWith({ status: "empty" });
  });
});
