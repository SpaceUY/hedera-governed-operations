"use client";

import type { ReactNode } from "react";
import type { CouncilKey } from "@sh/core/governance/council";
import { AnimatedNumber } from "~~/components/governance/AnimatedNumber";
import type { TokenQueryData } from "~~/hooks/mirror/useToken";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";
import type { TreasuryFigures } from "~~/services/governance/treasury";
import { HBAR_DECIMALS, formatAmountFigure } from "~~/utils/scaffold-hbar/hbarAmount";

/**
 * A token as Mirror described it: `null` until it answers, `"unreadable"` when it could not be read
 * or its decimals could not be — an amount is then shown as "—", never on a guessed scale.
 */
export type TokenReading = TokenQueryData | "unreadable" | null;

const LOADING = "…";
const UNREADABLE = "—";
const WHOLE_UNITS = /^\d+$/;

const Figure = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-xs text-base-content/60">{label}</dt>
    <dd className="m-0 truncate text-lg font-semibold tabular-nums">{children}</dd>
  </div>
);

const Unit = ({ children }: { children: ReactNode }) => <span className="text-xs font-normal">{children}</span>;

const Amount = ({ units, decimals }: { units: number | bigint; decimals: number }) => (
  <AnimatedNumber value={units} format={value => formatAmountFigure(value, decimals)} />
);

const HbarAmount = ({ tinybars }: { tinybars: number | bigint }) => (
  <>
    <Amount units={tinybars} decimals={HBAR_DECIMALS} /> <Unit>ℏ</Unit>
  </>
);

function usdcFigure(treasury: TreasuryFigures | null, usdc: TokenReading): ReactNode {
  if (usdc === "unreadable") return UNREADABLE;
  if (!treasury || !usdc) return LOADING;
  return <Amount units={treasury.usdcBalance} decimals={usdc.decimals} />;
}

function supplyFigure(token: TokenReading): ReactNode {
  if (token === "unreadable") return UNREADABLE;
  if (!token) return LOADING;
  if (!WHOLE_UNITS.test(token.token.total_supply)) return UNREADABLE;
  return <Amount units={BigInt(token.token.total_supply)} decimals={token.decimals} />;
}

function supplyLabel(token: TokenReading): string {
  return `${token && token !== "unreadable" ? token.token.symbol : "Token"} supply`;
}

type TreasuryStripProps = {
  /** The figures of the world the map shows, null until read; they count when they change. */
  treasury: TreasuryFigures | null;
  council: CouncilKey | null;
  /** The token the council governs: its total supply is the figure, its symbol names it. */
  governedToken: TokenReading;
  /** The swap provider's USDC, read for its decimals. */
  usdc: TokenReading;
};

/**
 * The governance account's balances, the governed token's supply and the council's rule, in one
 * line above the map. Every token amount is written with the decimals Mirror reports for it.
 */
export const TreasuryStrip = ({ treasury, council, governedToken, usdc }: TreasuryStripProps) => (
  <section aria-label="Treasury" className="border-b border-base-300 px-6 py-4">
    <dl className="m-0 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
      <Figure label="Treasury HBAR">
        {treasury ? <HbarAmount tinybars={treasury.hbarBalanceTinybar} /> : LOADING}
      </Figure>
      <Figure label="USDC from swaps">{usdcFigure(treasury, usdc)}</Figure>
      <Figure label={supplyLabel(governedToken)}>{supplyFigure(governedToken)}</Figure>
      <Figure label="Reserve in the vault">
        {treasury ? <HbarAmount tinybars={treasury.vaultReserveTinybar} /> : LOADING}
      </Figure>
      <Figure label="Council threshold">
        {council ? (
          <>
            {councilRuleLabel(council)} <Unit>signatures</Unit>
          </>
        ) : (
          LOADING
        )}
      </Figure>
    </dl>
  </section>
);
