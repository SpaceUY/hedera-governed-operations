"use client";

import type { ReactNode } from "react";
import type { CouncilKey } from "@sh/core/governance/council";
import { AnimatedNumber } from "~~/components/governance/AnimatedNumber";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";
import type { TreasuryFigures } from "~~/services/governance/treasury";
import { formatTinybars } from "~~/utils/scaffold-hbar/hbarAmount";

const Figure = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-xs text-base-content/60">{label}</dt>
    <dd className="m-0 truncate text-lg font-semibold tabular-nums">{children}</dd>
  </div>
);

type TreasuryStripProps = {
  /** The figures of the world the map shows, null until read; they count when they change. */
  treasury: TreasuryFigures | null;
  council: CouncilKey | null;
};

/** The governance account's balances and the council's rule, in one line above the map. */
export const TreasuryStrip = ({ treasury, council }: TreasuryStripProps) => (
  <section aria-label="Treasury" className="border-b border-base-300 px-6 py-4">
    <dl className="m-0 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
      <Figure label="HBAR">
        {treasury ? <AnimatedNumber value={treasury.hbarBalanceTinybar} format={formatTinybars} /> : "…"}
      </Figure>
      <Figure label="Vault reserve">
        {treasury ? <AnimatedNumber value={treasury.vaultReserveTinybar} format={formatTinybars} /> : "…"}
      </Figure>
      <Figure label="ACME">{treasury ? <AnimatedNumber value={treasury.acmeBalance} /> : "…"}</Figure>
      <Figure label="USDC">{treasury ? <AnimatedNumber value={treasury.usdcBalance} /> : "…"}</Figure>
      <Figure label="Council threshold">
        {council ? (
          <>
            {councilRuleLabel(council)} <span className="text-xs font-normal">signatures</span>
          </>
        ) : (
          "…"
        )}
      </Figure>
    </dl>
  </section>
);
