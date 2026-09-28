import { useSwapQuote } from "./useSwapQuote";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "~~/hooks/mirror/testUtils";
import { createSwapProvider } from "~~/services/swap";

vi.mock("~~/services/swap", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/services/swap")>()),
  createSwapProvider: vi.fn(),
}));

const USDC_ID = "0.0.5449";
const QUOTE = {
  amountOut: 6_340_000n,
  amountOutMinimum: 6_308_300n,
  route: { dex: "saucerswap-v2", hops: [] },
};

const provider = (quote: () => Promise<typeof QUOTE>) => {
  vi.mocked(createSwapProvider).mockReturnValue({ quote, buildSwapStep: vi.fn() });
};

const render = (amountInTinybars: bigint | null) =>
  renderHook(() => useSwapQuote({ network: "testnet", tokenOutId: USDC_ID, amountInTinybars }), {
    wrapper: createQueryWrapper(),
  });

afterEach(() => {
  cleanup();
  vi.mocked(createSwapProvider).mockReset();
});

describe("useSwapQuote", () => {
  it("quotes the HBAR the treasury sells against the output token", async () => {
    const quote = vi.fn().mockResolvedValue(QUOTE);
    provider(quote);

    const { result } = render(5_000_000_000n);

    await waitFor(() => expect(result.current.data).toEqual(QUOTE));
    expect(quote).toHaveBeenCalledWith({
      tokenIn: { kind: "hbar" },
      tokenOut: { kind: "hts", tokenId: USDC_ID },
      amountIn: 5_000_000_000n,
    });
  });

  it.each([null, 0n])("asks for no quote while there is nothing to sell (%s)", async amountInTinybars => {
    const quote = vi.fn().mockResolvedValue(QUOTE);
    provider(quote);

    const { result } = render(amountInTinybars);

    expect(result.current.fetchStatus).toBe("idle");
    expect(quote).not.toHaveBeenCalled();
  });

  it("surfaces the pool's error rather than retrying behind a spinner", async () => {
    provider(vi.fn().mockRejectedValue(new Error("no pool for this pair")));

    const { result } = render(5_000_000_000n);

    await waitFor(() => expect(result.current.error?.message).toBe("no pool for this pair"));
  });
});
