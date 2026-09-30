import { createQueryWrapper } from "./testUtils";
import { useTreasuryFigures } from "./useTreasuryFigures";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTreasuryFigures } from "~~/services/governance/treasury";

vi.mock("~~/services/governance/treasury", () => ({ fetchTreasuryFigures: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(fetchTreasuryFigures).mockReset();
});

describe("useTreasuryFigures", () => {
  it("fetches the figures for the given ids", async () => {
    vi.mocked(fetchTreasuryFigures).mockResolvedValue({
      hbarBalanceTinybar: 1,
      demoTokenBalance: 2,
      usdcBalance: 3,
      vaultReserveTinybar: 4n,
    });

    const { result } = renderHook(
      () =>
        useTreasuryFigures({
          governanceAccountId: "0.0.10671146",
          vaultContractId: "0.0.10671260",
          demoTokenId: "0.0.10671333",
          usdcTokenId: "0.0.5449",
        }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => expect(result.current.data?.vaultReserveTinybar).toBe(4n));
    expect(vi.mocked(fetchTreasuryFigures)).toHaveBeenCalledWith(
      expect.objectContaining({ vaultContractId: "0.0.10671260", demoTokenId: "0.0.10671333" }),
    );
  });
});
