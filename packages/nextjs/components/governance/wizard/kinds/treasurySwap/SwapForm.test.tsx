import { SwapForm } from "./SwapForm";
import { MirrorNodeError } from "@sh/core/mirror";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Chain } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useToken } from "~~/hooks/mirror/useToken";
import { useSwapQuote } from "~~/hooks/swap/useSwapQuote";

vi.mock("~~/hooks/mirror/useToken", () => ({ useToken: vi.fn() }));
vi.mock("~~/hooks/swap/useSwapQuote", () => ({ useSwapQuote: vi.fn() }));
vi.mock("@scaffold-hbar-ui/components", () => ({
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
const CHAIN = { id: 296, name: "Hedera Testnet" } as Chain;
const ADAPTER = "0x9507B1d193fA1E38F2da77A6b6C82B1c8b7672d3";
const ADAPTER_CONTRACT_ID = "0.0.10671180";

const tokenRead = (decimals: number) =>
  vi.mocked(useToken).mockReturnValue({
    data: { token: { symbol: "USDC" }, decimals },
    isError: false,
    error: null,
  } as never);

const tokenUnreadable = () =>
  vi.mocked(useToken).mockReturnValue({
    data: undefined,
    isError: true,
    error: new MirrorNodeError(500, "/tokens/0.0.5449", "boom"),
  } as never);

const quoted = (amountOut: bigint | null) =>
  vi.mocked(useSwapQuote).mockReturnValue({
    data: amountOut === null ? undefined : { amountOut, amountOutMinimum: amountOut, route: { dex: "x", hops: [] } },
    isError: false,
    isLoading: false,
  } as never);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderForm = () => {
  const onDraftChange = vi.fn();
  render(
    <SwapForm
      targets={{ adapter: ADAPTER, adapterLabel: ADAPTER_CONTRACT_ID, governanceAccountId: TREASURY }}
      network="testnet"
      chain={CHAIN}
      council={undefined}
      onDraftChange={onDraftChange}
    />,
  );
  return onDraftChange;
};

const fill = (amount: string, floor: string) => {
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: amount } });
  fireEvent.change(screen.getByLabelText(/floor/i), { target: { value: floor } });
};

const lastDraft = (onDraftChange: ReturnType<typeof vi.fn>) => onDraftChange.mock.lastCall?.[0];

describe("SwapForm", () => {
  it("drafts a swap through the adapter from the amount and the floor that were typed", () => {
    tokenRead(6);
    quoted(6_340_000n);
    const onDraftChange = renderForm();

    fill("50", "6.25");

    expect(lastDraft(onDraftChange)).toMatchObject({
      status: "ready",
      draft: { path: "registry", kind: "treasurySwap", target: `Swap adapter · ${ADAPTER_CONTRACT_ID}` },
    });
  });

  it("reads the floor with the output token's decimals, not HBAR's", () => {
    tokenRead(6);
    quoted(6_340_000n);
    const onDraftChange = renderForm();

    // Eight decimal places would pass as an HBAR amount; six is what this token has.
    fill("50", "6.2500001");

    expect(lastDraft(onDraftChange)).toMatchObject({ status: "invalid", message: expect.stringMatching(/6 decimal/) });
  });

  it("shows what the pool would pay for that HBAR right now", () => {
    tokenRead(6);
    quoted(6_340_000n);
    renderForm();

    fill("50", "");

    expect(screen.getByText(/6\.34 USDC/)).toBeTruthy();
  });

  it("refuses to draft on a token it could not read, rather than guessing its scale", () => {
    tokenUnreadable();
    quoted(null);
    const onDraftChange = renderForm();

    fill("50", "6.25");

    expect(lastDraft(onDraftChange)).toMatchObject({
      status: "invalid",
      message: expect.stringMatching(/could not read/i),
    });
  });

  it("drafts nothing until both the amount and the floor are set", () => {
    tokenRead(6);
    quoted(null);
    const onDraftChange = renderForm();

    fill("50", "");

    expect(lastDraft(onDraftChange)).toEqual({ status: "empty" });
  });
});
