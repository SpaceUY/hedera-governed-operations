import { TreasuryStrip } from "./TreasuryStrip";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useToken } from "~~/hooks/mirror/useToken";

vi.mock("~~/components/governance/GovernanceProvider", () => ({
  useGovernanceConfig: () => ({
    network: "testnet",
    governanceAccountId: "0.0.10671146",
    demoTokenId: "0.0.7000",
    executor: { hederaContractId: "0.0.4242" },
    vault: { hederaContractId: "0.0.4243" },
  }),
}));
vi.mock("~~/hooks/mirror/useTreasuryFigures", () => ({
  useTreasuryFigures: () => ({
    data: { hbarBalanceTinybar: 100_000_000, vaultReserveTinybar: 0n, demoTokenBalance: 42, usdcBalance: 0 },
  }),
}));
vi.mock("~~/hooks/mirror/useCouncil", () => ({ useCouncil: () => ({ data: undefined }) }));
vi.mock("~~/hooks/mirror/useToken", () => ({ useToken: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TreasuryStrip", () => {
  it("labels the governed token's balance with the symbol Mirror reports", () => {
    vi.mocked(useToken).mockReturnValue({ data: { token: { symbol: "GOVD" }, decimals: 0 } } as never);

    render(<TreasuryStrip />);

    expect(useToken).toHaveBeenLastCalledWith("0.0.7000", { network: "testnet" });
    expect(screen.getByText("GOVD").nextElementSibling?.textContent).toBe("42");
  });

  it("falls back to a generic label while the token has not been read", () => {
    vi.mocked(useToken).mockReturnValue({ data: undefined } as never);

    render(<TreasuryStrip />);

    expect(screen.getByText("Token").nextElementSibling?.textContent).toBe("42");
  });
});
