import { TransferForm } from "./TransferForm";
import { MirrorNodeError } from "@sh/core/mirror";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Chain } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RECIPIENT_LOOKUP_LABELS } from "~~/components/governance/wizard/copy";
import { useAccount } from "~~/hooks/mirror/useAccount";

vi.mock("~~/hooks/mirror/useAccount", () => ({ useAccount: vi.fn() }));
vi.mock("@scaffold-hbar-ui/components", () => ({
  HederaAddressInput: ({
    value,
    onChange,
    chainId,
  }: {
    value: string;
    onChange: (v: string) => void;
    chainId?: number;
  }) => (
    <input
      aria-label="Recipient"
      data-chain-id={chainId}
      value={value}
      onChange={event => onChange(event.target.value)}
    />
  ),
  HbarInput: ({
    chain,
    onValueChange,
  }: {
    chain?: Chain;
    onValueChange: (value: { valueInNative: string; valueInUsd: string; displayUsdMode: boolean }) => void;
  }) => (
    <input
      aria-label="Amount"
      data-chain-id={chain?.id}
      onChange={event => onValueChange({ valueInNative: event.target.value, valueInUsd: "", displayUsdMode: false })}
    />
  ),
}));

const TREASURY = "0.0.10671146";
const EVM_RECIPIENT = "0x3353E89f1f9feF7A0881E5E92f8A0A7fd3A13097";
const CHAIN = { id: 295, name: "Hedera" } as Chain;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderForm = () => {
  const onDraftChange = vi.fn();
  render(
    <TransferForm
      governanceAccountId={TREASURY}
      network="mainnet"
      chain={CHAIN}
      council={undefined}
      onDraftChange={onDraftChange}
    />,
  );
  return onDraftChange;
};

const accountFound = (account: string) =>
  vi.mocked(useAccount).mockReturnValue({ data: { account }, isError: false, error: null } as never);

const accountLookupFails = (status: number) =>
  vi.mocked(useAccount).mockReturnValue({
    data: undefined,
    isError: true,
    error: new MirrorNodeError(status, "https://mirror/api/v1/accounts/x", "{}"),
  } as never);

const fill = ({ recipient, amount }: { recipient: string; amount: string }) => {
  fireEvent.change(screen.getByLabelText("Recipient"), { target: { value: recipient } });
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: amount } });
};

const lastResult = (onDraftChange: ReturnType<typeof vi.fn>) => onDraftChange.mock.lastCall?.[0];

describe("TransferForm", () => {
  it("reads the recipient and prices the amount on the target network", () => {
    vi.mocked(useAccount).mockReturnValue({ data: undefined, isError: false, error: null } as never);
    renderForm();

    fireEvent.change(screen.getByLabelText("Recipient"), { target: { value: "0.0.500" } });

    expect(useAccount).toHaveBeenLastCalledWith("0.0.500", { network: "mainnet" });
    expect(screen.getByLabelText("Recipient").getAttribute("data-chain-id")).toBe("295");
    expect(screen.getByLabelText("Amount").getAttribute("data-chain-id")).toBe("295");
  });

  it("drafts a payment to the account an EVM address resolves to", () => {
    accountFound("0.0.500");
    const onDraftChange = renderForm();

    fill({ recipient: EVM_RECIPIENT, amount: "1.5" });

    const result = lastResult(onDraftChange);
    expect(result.status).toBe("ready");
    expect(result.draft.target).toBe("Recipient · 0.0.500");
  });

  it("says no account exists when the Mirror Node has none", () => {
    accountLookupFails(404);
    const onDraftChange = renderForm();

    fill({ recipient: "0.0.404", amount: "1" });

    expect(lastResult(onDraftChange)).toEqual({ status: "invalid", message: "No account found for 0.0.404" });
  });

  it("says the lookup failed, not that the account is missing, when the Mirror Node errors", () => {
    accountLookupFails(503);
    const onDraftChange = renderForm();

    fill({ recipient: "0.0.500", amount: "1" });

    expect(lastResult(onDraftChange)).toEqual({
      status: "invalid",
      message: "Could not look up 0.0.500 right now. Try again.",
    });
  });

  it("says a malformed recipient is neither an account id nor an address, instead of waiting on it", () => {
    vi.mocked(useAccount).mockReturnValue({ data: undefined, isError: false, error: null } as never);
    const onDraftChange = renderForm();

    fill({ recipient: "alice", amount: "1" });

    expect(lastResult(onDraftChange)).toEqual({
      status: "invalid",
      message: RECIPIENT_LOOKUP_LABELS.malformed("alice"),
    });
  });

  it("says it is looking the recipient up while the Mirror Node answers", () => {
    vi.mocked(useAccount).mockReturnValue({ data: undefined, isLoading: true, error: null } as never);
    const onDraftChange = renderForm();

    fill({ recipient: "0.0.500", amount: "1" });

    expect(screen.getByRole("status").textContent).toBe(RECIPIENT_LOOKUP_LABELS.loading("0.0.500"));
    expect(lastResult(onDraftChange)).toEqual({ status: "empty" });
  });

  it("refuses to pay the treasury itself", () => {
    accountFound(TREASURY);
    const onDraftChange = renderForm();

    fill({ recipient: TREASURY, amount: "1" });

    expect(lastResult(onDraftChange)).toMatchObject({
      status: "invalid",
      message: expect.stringMatching(/treasury itself/),
    });
  });

  it("refuses an amount finer than a tinybar", () => {
    accountFound("0.0.500");
    const onDraftChange = renderForm();

    fill({ recipient: "0.0.500", amount: "1.123456789" });

    expect(lastResult(onDraftChange)).toMatchObject({
      status: "invalid",
      message: expect.stringContaining("8 decimal places"),
    });
  });
});
