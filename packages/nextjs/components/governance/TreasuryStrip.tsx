"use client";

import type { ReactNode } from "react";
import { useGovernanceConfig } from "~~/components/governance/GovernanceProvider";
import { useCouncil } from "~~/hooks/mirror/useCouncil";
import { useTreasuryFigures } from "~~/hooks/mirror/useTreasuryFigures";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";
import { SAUCERSWAP_V2_CONFIG } from "~~/services/swap/saucerSwapConfig";
import { formatTinybars } from "~~/utils/scaffold-hbar/hbarAmount";

const Figure = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-xs text-base-content/60">{label}</dt>
    <dd className="m-0 truncate text-lg font-semibold tabular-nums">{children}</dd>
  </div>
);

/** The governance account's balances and the council's rule, in one line above the map. */
export const TreasuryStrip = () => {
  const { network, governanceAccountId, demoTokenId, executor, vault } = useGovernanceConfig();
  const treasury = useTreasuryFigures({
    governanceAccountId,
    vaultContractId: vault.hederaContractId,
    demoTokenId,
    usdcTokenId: SAUCERSWAP_V2_CONFIG[network].usdcToken,
    network,
  });
  const council = useCouncil({ governanceAccountId, executorContractId: executor.hederaContractId, network });

  return (
    <section aria-label="Treasury" className="border-b border-base-300 px-6 py-4">
      <dl className="m-0 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <Figure label="HBAR">{treasury.data ? formatTinybars(treasury.data.hbarBalanceTinybar) : "…"}</Figure>
        <Figure label="Vault reserve">{treasury.data ? formatTinybars(treasury.data.vaultReserveTinybar) : "…"}</Figure>
        <Figure label="ACME">{treasury.data?.acmeBalance ?? "…"}</Figure>
        <Figure label="USDC">{treasury.data?.usdcBalance ?? "…"}</Figure>
        <Figure label="Council threshold">
          {council.data ? (
            <>
              {councilRuleLabel(council.data.key)} <span className="text-xs font-normal">signatures</span>
            </>
          ) : (
            "…"
          )}
        </Figure>
      </dl>
    </section>
  );
};
