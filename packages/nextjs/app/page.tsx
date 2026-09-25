"use client";

import Link from "next/link";
import { Hbar } from "@hiero-ledger/sdk";
import { getDeployedContract, getGovernanceEntityIds } from "~~/config/governanceConfig";
import { useProposals } from "~~/hooks/mirror/useProposals";
import { useTreasuryFigures } from "~~/hooks/mirror/useTreasuryFigures";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { describeScheduledOperation } from "~~/services/governance/proposalTypes";
import { SAUCERSWAP_V2_CONFIG } from "~~/services/swap/saucerSwapConfig";
import { toHederaNetworkName } from "~~/utils/scaffold-hbar/networks";

export default function GovernanceHomePage() {
  const { targetNetwork } = useTargetNetwork();
  const vault = getDeployedContract(targetNetwork.id, "AcmeVault");
  const executor = getDeployedContract(targetNetwork.id, "GovernedExecutor");
  const { governanceAccountId, demoTokenId } = getGovernanceEntityIds();
  const usdcTokenId = SAUCERSWAP_V2_CONFIG[toHederaNetworkName("testnet")].usdcToken;

  const { inbox, council } = useProposals({ governanceAccountId, executorContractId: executor.hederaContractId! });
  const treasury = useTreasuryFigures({
    governanceAccountId,
    vaultContractId: vault.hederaContractId!,
    demoTokenId,
    usdcTokenId,
  });

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-6 sm:py-8">
      <h1 className="text-3xl font-bold mb-6">Governed Operations</h1>

      <section
        aria-label="Treasury"
        className="stats stats-vertical sm:stats-horizontal w-full shadow-sm border border-base-300 bg-base-100 mb-6"
      >
        <div className="stat">
          <div className="stat-title">HBAR</div>
          <div className="stat-value text-lg">
            {treasury.data ? Hbar.fromTinybars(treasury.data.hbarBalanceTinybar).toString() : "…"}
          </div>
        </div>
        <div className="stat">
          <div className="stat-title">Vault reserve</div>
          <div className="stat-value text-lg">
            {treasury.data ? Hbar.fromTinybars(treasury.data.vaultReserveTinybar).toString() : "…"}
          </div>
        </div>
        <div className="stat">
          <div className="stat-title">ACME</div>
          <div className="stat-value text-lg">{treasury.data?.acmeBalance ?? "…"}</div>
        </div>
        <div className="stat">
          <div className="stat-title">USDC</div>
          <div className="stat-value text-lg">{treasury.data?.usdcBalance ?? "…"}</div>
        </div>
      </section>

      <section aria-label="Council" className="card border border-base-300 bg-base-100 shadow-sm mb-6">
        <div className="card-body py-5">
          <h2 className="card-title text-base">Council</h2>
          {council.data ? (
            <p>
              {council.data.key.threshold} of {council.data.key.memberKeys.length} signatures required
            </p>
          ) : (
            <span className="loading loading-spinner loading-sm" aria-label="Loading council" />
          )}
        </div>
      </section>

      <section aria-label="Pending proposals" className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body py-5">
          <h2 className="card-title text-base">Pending proposals</h2>
          {inbox.data ? (
            <ul className="flex flex-col gap-2">
              {inbox.data.proposals.map(proposal => (
                <li key={proposal.schedule.schedule_id}>
                  <Link href={`/governance/${proposal.schedule.schedule_id}`} className="link link-primary">
                    {describeScheduledOperation(proposal.operation)} — {proposal.state.status} —{" "}
                    {proposal.progress.signed} of {proposal.progress.threshold}
                    {proposal.incomingProgress
                      ? ` (+ ${proposal.incomingProgress.signed} of ${proposal.incomingProgress.threshold} incoming)`
                      : ""}
                  </Link>
                </li>
              ))}
              {inbox.data.proposals.length === 0 && <p className="text-sm text-base-content/60">No proposals yet.</p>}
            </ul>
          ) : (
            <span className="loading loading-spinner loading-sm" aria-label="Loading proposals" />
          )}
        </div>
      </section>
    </div>
  );
}
