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

/** A balance of the governance account's in a token, on the scale Mirror reports for that token. */
function tokenFigure(units: number | undefined, token: TokenReading): ReactNode {
  if (token === "unreadable") return UNREADABLE;
  if (units === undefined || !token) return LOADING;
  return <Amount units={units} decimals={token.decimals} />;
}

const symbolOf = (token: TokenReading): string => (token && token !== "unreadable" ? token.token.symbol : "Token");

type TreasuryStripProps = {
  /** The figures of the world the map shows, null until read; they count when they change. */
  treasury: TreasuryFigures | null;
  council: CouncilKey | null;
  /** The token the council governs, read for its symbol, which names the figure, and its decimals. */
  governedToken: TokenReading;
  /** The swap provider's USDC, read for its decimals. */
  usdc: TokenReading;
};

/**
 * The governance account's balances and the council's rule, in one line above the map. Every token
 * amount is written with the decimals Mirror reports for it.
 */
export const TreasuryStrip = ({ treasury, council, governedToken, usdc }: TreasuryStripProps) => (
  <section aria-label="Treasury" className="border-b border-base-300 px-6 py-4">
    <dl className="m-0 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
      <Figure label="HBAR">{treasury ? <HbarAmount tinybars={treasury.hbarBalanceTinybar} /> : LOADING}</Figure>
      <Figure label="Vault reserve">
        {treasury ? <HbarAmount tinybars={treasury.vaultReserveTinybar} /> : LOADING}
      </Figure>
      <Figure label={symbolOf(governedToken)}>{tokenFigure(treasury?.demoTokenBalance, governedToken)}</Figure>
      <Figure label="USDC">{tokenFigure(treasury?.usdcBalance, usdc)}</Figure>
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
