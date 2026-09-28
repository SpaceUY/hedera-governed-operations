import { AddAgentForm } from "./AddAgentForm";
import { CO_SIGNING_AGENT_COPY } from "./copy";
import { PrivateKey } from "@hiero-ledger/sdk";
import { type CouncilKey, memberKeyOfAccount } from "@sh/core/governance/council";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Chain } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccount } from "~~/hooks/mirror/useAccount";
import type { DraftResult } from "~~/services/governance/drafts";

vi.mock("~~/hooks/mirror/useAccount", () => ({ useAccount: vi.fn() }));
vi.mock("~~/components/governance/graph/useCouncilSeatNames", () => ({ useCouncilSeatNames: () => SEATS }));
vi.mock("@scaffold-hbar-ui/components", () => ({
  HederaAddressInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Agent account" value={value} onChange={event => onChange(event.target.value)} />
  ),
}));

const CHAIN = { id: 296, name: "Hedera Testnet" } as Chain;
const TREASURY = "0.0.10746004";
const AGENT = "0.0.600";
const ecdsa = () => {
  const publicKey = PrivateKey.generateECDSA().publicKey;
  return { _type: "ECDSA_SECP256K1", key: publicKey.toStringRaw() };
};
const bob = ecdsa();
const COUNCIL: CouncilKey = {
  threshold: 2,
  memberKeys: [ecdsa(), ecdsa(), bob].map(key => memberKeyOfAccount(key) ?? ""),
};
const SEATS = vi.hoisted(() => [
  { label: "0.0.10746002", isViewer: true },
  { label: "Alice", isViewer: false },
  { label: "Bob", isViewer: false },
]);

beforeEach(() => {
  vi.mocked(useAccount).mockReturnValue({ data: undefined, error: null, isLoading: false } as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderForm = (suggestedAgentAccountId: string | null = null) => {
  const onDraftChange = vi.fn<(result: DraftResult) => void>();
  render(
    <AddAgentForm
      targets={{ governanceAccountId: TREASURY, executorContractId: "0.0.4200", suggestedAgentAccountId }}
      network="testnet"
      chain={CHAIN}
      council={COUNCIL}
      onDraftChange={onDraftChange}
    />,
  );
  return onDraftChange;
};

describe("AddAgentForm", () => {
  it("names the council it would make, both thresholds, and that the agent never signs", () => {
    renderForm();

    expect(screen.getByText("2-of-4 council").tagName).toBe("STRONG");
    expect(screen.getByText("2-of-4 council").parentElement?.textContent).toBe(
      "New treasury key: a 2-of-4 council — your wallet, Alice, Bob and the agent. With the agent as one of 4 keys " +
        "and 2 required, neither the agent nor any one person can act alone.",
    );
    expect(screen.getByRole("note").textContent).toBe(CO_SIGNING_AGENT_COPY.bothCouncils(COUNCIL));
    expect(screen.getByText(CO_SIGNING_AGENT_COPY.agentNeverSigns)).toBeTruthy();
  });

  it("drafts the rotation once the typed account is a non-member ECDSA account", () => {
    const onDraftChange = renderForm();
    vi.mocked(useAccount).mockReturnValue({ data: { account: AGENT, key: ecdsa() }, error: null } as never);
    fireEvent.change(screen.getByLabelText("Agent account"), { target: { value: AGENT } });

    const result = onDraftChange.mock.lastCall?.[0];
    expect(result).toMatchObject({ status: "ready", draft: { kind: "councilRotation", path: "native" } });
  });

  it("refuses a council member, with the reason", () => {
    vi.mocked(useAccount).mockReturnValue({ data: { account: AGENT, key: bob }, error: null } as never);
    const onDraftChange = renderForm(AGENT);

    expect(onDraftChange.mock.lastCall?.[0]).toEqual({
      status: "invalid",
      message: CO_SIGNING_AGENT_COPY.alreadyMember(AGENT),
    });
  });

  it("starts from the suggested agent account when the configuration names one", () => {
    renderForm(AGENT);

    expect((screen.getByLabelText("Agent account") as HTMLInputElement).value).toBe(AGENT);
    expect(vi.mocked(useAccount).mock.lastCall?.[0]).toBe(AGENT);
  });
});
