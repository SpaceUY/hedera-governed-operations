import { type TokenReading, TreasuryStrip } from "./TreasuryStrip";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MAP_SNAPSHOT } from "~~/components/governance/graph/mapFixtures";
import type { TreasuryFigures } from "~~/services/governance/treasury";

const TREASURY: TreasuryFigures = {
  hbarBalanceTinybar: 124_050_000_000,
  demoTokenBalance: 5,
  usdcBalance: 1_000_000,
  vaultReserveTinybar: 50_000_000_000n,
};

function tokenOf(symbol: string, decimals: number, totalSupply = "0"): TokenReading {
  return { token: { symbol, total_supply: totalSupply }, decimals } as TokenReading;
}

const GOVD = tokenOf("GOVD", 0, "1000000");
const USDC = tokenOf("USDC", 6);

function figures(): { label: string; value: string }[] {
  return screen.getAllByRole("term").map(term => ({
    label: term.textContent ?? "",
    value: term.nextElementSibling?.textContent ?? "",
  }));
}

afterEach(cleanup);

describe("TreasuryStrip", () => {
  it("writes the figures in the prototype's order, with two decimals and each token's own scale", () => {
    render(<TreasuryStrip treasury={TREASURY} council={MAP_SNAPSHOT.council} governedToken={GOVD} usdc={USDC} />);

    expect(figures()).toEqual([
      { label: "Treasury HBAR", value: "1,240.50 ℏ" },
      { label: "USDC from swaps", value: "1.00" },
      { label: "GOVD supply", value: "1,000,000" },
      { label: "Reserve in the vault", value: "500.00 ℏ" },
      { label: "Council threshold", value: "2-of-3 signatures" },
    ]);
  });

  it("shows the governed token's total supply, not the treasury's holding of it", () => {
    render(
      <TreasuryStrip treasury={TREASURY} council={null} governedToken={tokenOf("USDX", 8, "250000000")} usdc={USDC} />,
    );

    expect(screen.getByText("USDX supply").nextElementSibling?.textContent).toBe("2.50");
  });

  it("waits for each read before writing a figure", () => {
    render(<TreasuryStrip treasury={null} council={null} governedToken={null} usdc={null} />);

    expect(figures().map(({ label, value }) => [label, value])).toEqual([
      ["Treasury HBAR", "…"],
      ["USDC from swaps", "…"],
      ["Token supply", "…"],
      ["Reserve in the vault", "…"],
      ["Council threshold", "…"],
    ]);
  });

  it("writes a dash, never a guessed scale, when a token or its decimals cannot be read", () => {
    render(<TreasuryStrip treasury={TREASURY} council={null} governedToken="unreadable" usdc="unreadable" />);

    expect(screen.getByText("USDC from swaps").nextElementSibling?.textContent).toBe("—");
    expect(screen.getByText("Token supply").nextElementSibling?.textContent).toBe("—");
  });

  it("writes a dash for a supply Mirror did not give as whole units", () => {
    render(<TreasuryStrip treasury={TREASURY} council={null} governedToken={tokenOf("GOVD", 0, "")} usdc={USDC} />);

    expect(screen.getByText("GOVD supply").nextElementSibling?.textContent).toBe("—");
  });
});
