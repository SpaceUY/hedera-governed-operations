import type { ReactNode } from "react";
import { useTreasurySwapQuote } from "./useTreasurySwapQuote";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HBAR, createSwapProvider, htsToken } from "~~/services/swap";

const quote = vi.hoisted(() => vi.fn());

vi.mock("~~/services/swap", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/services/swap")>()),
  createSwapProvider: vi.fn(() => ({ quote, buildSwapStep: vi.fn() })),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe("useTreasurySwapQuote", () => {
  it("asks the network's swap provider what the pool pays for the HBAR", async () => {
    quote.mockResolvedValue({ amountOut: 10n, amountOutMinimum: 9n, route: { dex: "saucerswap-v2", hops: [] } });

    const { result } = renderHook(
      () => useTreasurySwapQuote({ network: "testnet", tokenOutId: "0.0.5449", amountInTinybars: 100n }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data?.amountOut).toBe(10n));
    expect(createSwapProvider).toHaveBeenCalledWith("testnet");
    expect(quote).toHaveBeenCalledWith({ tokenIn: HBAR, tokenOut: htsToken("0.0.5449"), amountIn: 100n });
  });

  it("asks nothing while there is no amount to sell", () => {
    quote.mockClear();
    renderHook(() => useTreasurySwapQuote({ network: "testnet", tokenOutId: "0.0.5449", amountInTinybars: null }), {
      wrapper,
    });
    renderHook(() => useTreasurySwapQuote({ network: "testnet", tokenOutId: "0.0.5449", amountInTinybars: 0n }), {
      wrapper,
    });
    expect(quote).not.toHaveBeenCalled();
  });
});
