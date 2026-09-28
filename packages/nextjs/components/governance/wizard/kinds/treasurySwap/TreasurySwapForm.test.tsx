import { TreasurySwapForm } from "./TreasurySwapForm";
import { TREASURY_SWAP_COPY } from "./copy";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Chain } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenUnreadableLabel } from "~~/components/governance/wizard/copy";
import { useToken } from "~~/hooks/mirror/useToken";
import { useTreasurySwapQuote } from "~~/hooks/useTreasurySwapQuote";
import type { DraftResult } from "~~/services/governance/drafts";
import { DEFAULT_SLIPPAGE_BPS } from "~~/services/swap";

vi.mock("~~/hooks/mirror/useToken", () => ({ useToken: vi.fn() }));
vi.mock("~~/hooks/useTreasurySwapQuote", () => ({ useTreasurySwapQuote: vi.fn() }));
// The quote reads the amount as typed, with no wait, so the tests need no timers.
vi.mock("usehooks-ts", () => ({ useDebounceValue: (value: unknown) => [value] }));
vi.mock("@scaffold-hbar-ui/components", () => ({
  HbarInput: ({ onValueChange }: { onValueChange: (value: { valueInNative: string }) => void }) => (
    <input aria-label="HBAR to sell" onChange={event => onValueChange({ valueInNative: event.target.value })} />
  ),
}));

const TARGETS = {
  adapter: "0x00000000000000000000000000000000000005A9",
  adapterContractId: "0.0.4400",
  governanceAccountId: "0.0.10671146",
  tokenOutId: "0.0.5449",
  fee: 3000,
} as const;
const CHAIN = { id: 296, name: "Hedera Testnet" } as Chain;

beforeEach(() => {
  vi.mocked(useToken).mockReturnValue({ data: { token: { symbol: "USDC" }, decimals: 6 }, error: null } as never);
  vi.mocked(useTreasurySwapQuote).mockReturnValue({ data: undefined, isLoading: false, isError: false } as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderForm = () => {
  const onDraftChange = vi.fn<(result: DraftResult) => void>();
  render(
    <TreasurySwapForm
      targets={TARGETS}
      network="testnet"
      chain={CHAIN}
      council={undefined}
      onDraftChange={onDraftChange}
    />,
  );
  return onDraftChange;
};

const lastResult = (onDraftChange: ReturnType<typeof renderForm>) => onDraftChange.mock.lastCall?.[0];
const floorField = () => screen.getByLabelText(/Floor/) as HTMLInputElement;

const quoteReturns = (amountOut: bigint, amountOutMinimum: bigint) =>
  vi.mocked(useTreasurySwapQuote).mockReturnValue({
    data: { amountOut, amountOutMinimum, route: { dex: "saucerswap-v2", hops: [] } },
    isLoading: false,
    isError: false,
  } as never);

describe("TreasurySwapForm", () => {
  it("quotes the HBAR amount as tinybars, against the token it sells for", () => {
    renderForm();

    fireEvent.change(screen.getByLabelText("HBAR to sell"), { target: { value: "2.5" } });

    expect(useTreasurySwapQuote).toHaveBeenLastCalledWith({
      network: "testnet",
      tokenOutId: TARGETS.tokenOutId,
      amountInTinybars: 250_000_000n,
    });
  });

  it("drafts nothing until both the amount and the floor are set", () => {
    const onDraftChange = renderForm();

    fireEvent.change(screen.getByLabelText("HBAR to sell"), { target: { value: "2.5" } });

    expect(lastResult(onDraftChange)).toEqual({ status: "empty" });
  });

  it("drafts the swap with the floor in the token's units", () => {
    const onDraftChange = renderForm();

    fireEvent.change(screen.getByLabelText("HBAR to sell"), { target: { value: "2.5" } });
    fireEvent.change(floorField(), { target: { value: "0.4" } });

    const result = lastResult(onDraftChange);
    expect(result?.status === "ready" && result.draft.kind).toBe("treasurySwap");
  });

  it("shows today's quote and can set the floor from it, as a limit the proposer can still change", () => {
    quoteReturns(432_100n, 429_939n);
    renderForm();

    expect(screen.getByText(TREASURY_SWAP_COPY.quote("0.4321", "USDC"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: TREASURY_SWAP_COPY.useQuote(DEFAULT_SLIPPAGE_BPS) }));

    expect(floorField().value).toBe("0.429939");
  });

  it("warns that a floor above today's quote only runs if the price improves", () => {
    quoteReturns(432_100n, 429_939n);
    renderForm();

    fireEvent.change(floorField(), { target: { value: "0.5" } });

    expect(screen.getByRole("status").textContent).toBe(TREASURY_SWAP_COPY.floorAboveQuote);
  });

  it("passes on the encoder's refusal of a zero floor as it is", () => {
    const onDraftChange = renderForm();

    fireEvent.change(screen.getByLabelText("HBAR to sell"), { target: { value: "1" } });
    fireEvent.change(floorField(), { target: { value: "0" } });

    expect(lastResult(onDraftChange)).toMatchObject({
      status: "invalid",
      message: expect.stringContaining("no floor accepts any price"),
    });
  });

  it("says the token could not be read rather than guessing its decimals", () => {
    vi.mocked(useToken).mockReturnValue({ data: undefined, error: new Error("503") } as never);
    const onDraftChange = renderForm();

    fireEvent.change(screen.getByLabelText("HBAR to sell"), { target: { value: "1" } });
    fireEvent.change(floorField(), { target: { value: "0.4" } });

    expect(lastResult(onDraftChange)).toEqual({ status: "invalid", message: tokenUnreadableLabel(TARGETS.tokenOutId) });
  });
});
