import { CouncilRotationForm } from "./CouncilRotationForm";
import { COUNCIL_ROTATION_COPY } from "./copy";
import { PrivateKey } from "@hiero-ledger/sdk";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Chain } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccounts } from "~~/hooks/mirror/useAccount";
import type { DraftResult } from "~~/services/governance/drafts";

vi.mock("~~/hooks/mirror/useAccount", () => ({ useAccounts: vi.fn() }));
vi.mock("@scaffold-hbar-ui/components", () => ({
  HederaAddressInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Account" value={value} onChange={event => onChange(event.target.value)} />
  ),
}));

const TREASURY = "0.0.10671146";
const CHAIN = { id: 296, name: "Hedera Testnet" } as Chain;
const CURRENT = { threshold: 2, memberKeys: ["a", "b", "c"] };
const KEYS: Record<string, string> = {
  "0.0.501": PrivateKey.generateED25519().publicKey.toStringRaw(),
  "0.0.502": PrivateKey.generateED25519().publicKey.toStringRaw(),
};

// Every typed id resolves at once to an account with a key of its own, in the order typed.
beforeEach(() => {
  vi.mocked(useAccounts).mockImplementation(
    ids =>
      ids.map(id => ({
        account: KEYS[id] ? { account: id, key: { _type: "ED25519", key: KEYS[id] } } : undefined,
        error: null,
        isLoading: false,
      })) as never,
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderForm = () => {
  const onDraftChange = vi.fn<(result: DraftResult) => void>();
  render(
    <CouncilRotationForm
      targets={{ governanceAccountId: TREASURY }}
      network="testnet"
      chain={CHAIN}
      council={CURRENT}
      onDraftChange={onDraftChange}
    />,
  );
  return onDraftChange;
};

const lastResult = (onDraftChange: ReturnType<typeof renderForm>) => onDraftChange.mock.lastCall?.[0];
const members = () => screen.getAllByLabelText("Account");
const typeMember = (position: number, value: string) => fireEvent.change(members()[position], { target: { value } });
const threshold = () => screen.getByLabelText(COUNCIL_ROTATION_COPY.thresholdLabel) as HTMLSelectElement;

describe("CouncilRotationForm", () => {
  it("says both councils have to reach their thresholds, and that the agent never signs a rotation", () => {
    renderForm();

    expect(screen.getByRole("note").textContent).toBe(COUNCIL_ROTATION_COPY.bothCouncils("2-of-3", "1-of-1"));
    expect(screen.getByText(COUNCIL_ROTATION_COPY.agentNeverSigns)).toBeTruthy();
    expect(screen.getByText(COUNCIL_ROTATION_COPY.currentCouncil("2-of-3"))).toBeTruthy();
  });

  it("drafts the proposed council from the members listed and the threshold chosen", () => {
    const onDraftChange = renderForm();

    typeMember(0, "0.0.501");
    fireEvent.click(screen.getByRole("button", { name: COUNCIL_ROTATION_COPY.addMember }));
    typeMember(1, "0.0.502");
    fireEvent.change(threshold(), { target: { value: "2" } });

    const result = lastResult(onDraftChange);
    if (result?.status !== "ready") throw new Error("expected a draft");
    expect(result.draft).toMatchObject({ kind: "councilRotation", target: `Treasury key · ${TREASURY}` });
    expect(screen.getByRole("note").textContent).toBe(COUNCIL_ROTATION_COPY.bothCouncils("2-of-3", "2-of-2"));
  });

  it("never asks for more signatures than there are seats", () => {
    renderForm();

    expect(threshold().value).toBe("1");
    expect(Array.from(threshold().options).map(option => option.value)).toEqual(["1"]);
  });

  it("passes on the encoder's refusal of the same member listed twice", () => {
    const onDraftChange = renderForm();

    typeMember(0, "0.0.501");
    fireEvent.click(screen.getByRole("button", { name: COUNCIL_ROTATION_COPY.addMember }));
    typeMember(1, "0.0.501");

    expect(lastResult(onDraftChange)).toMatchObject({
      status: "invalid",
      message: expect.stringContaining("same key twice"),
    });
  });

  it("removes a member, keeping the others as typed", () => {
    renderForm();

    typeMember(0, "0.0.501");
    fireEvent.click(screen.getByRole("button", { name: COUNCIL_ROTATION_COPY.addMember }));
    typeMember(1, "0.0.502");
    fireEvent.click(screen.getByRole("button", { name: COUNCIL_ROTATION_COPY.removeMember(1) }));

    expect(members().map(input => (input as HTMLInputElement).value)).toEqual(["0.0.502"]);
  });
});
