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

function tokenOf(symbol: string, decimals: number): TokenReading {
  return { token: { symbol }, decimals } as TokenReading;
}

const GOVD = tokenOf("GOVD", 0);
const USDC = tokenOf("USDC", 6);

function figures(): { label: string; value: string }[] {
  return screen.getAllByRole("term").map(term => ({
    label: term.textContent ?? "",
    value: term.nextElementSibling?.textContent ?? "",
  }));
}

afterEach(cleanup);

describe("TreasuryStrip", () => {
  it("writes the treasury's balances and the council's rule, with two decimals and each token's own scale", () => {
    render(<TreasuryStrip treasury={TREASURY} council={MAP_SNAPSHOT.council} governedToken={GOVD} usdc={USDC} />);

    expect(figures()).toEqual([
      { label: "HBAR", value: "1,240.50 ℏ" },
      { label: "Vault reserve", value: "500.00 ℏ" },
      { label: "GOVD", value: "5" },
      { label: "USDC", value: "1.00" },
      { label: "Council threshold", value: "2-of-3 signatures" },
    ]);
  });

  it("shows the treasury's own balance of the governed token, on the token's scale", () => {
    render(
      <TreasuryStrip
        treasury={{ ...TREASURY, demoTokenBalance: 250_000_000 }}
        council={null}
        governedToken={tokenOf("USDX", 8)}
        usdc={USDC}
      />,
    );

    expect(screen.getByText("USDX").nextElementSibling?.textContent).toBe("2.50");
  });

  it("waits for each read before writing a figure", () => {
    render(<TreasuryStrip treasury={null} council={null} governedToken={null} usdc={null} />);

    expect(figures().map(({ label, value }) => [label, value])).toEqual([
      ["HBAR", "…"],
      ["Vault reserve", "…"],
      ["Token", "…"],
      ["USDC", "…"],
      ["Council threshold", "…"],
    ]);
  });

  it("writes a dash, never a guessed scale, when a token or its decimals cannot be read", () => {
    render(<TreasuryStrip treasury={TREASURY} council={null} governedToken="unreadable" usdc="unreadable" />);

    expect(screen.getByText("USDC").nextElementSibling?.textContent).toBe("—");
    expect(screen.getByText("Token").nextElementSibling?.textContent).toBe("—");
  });
});
