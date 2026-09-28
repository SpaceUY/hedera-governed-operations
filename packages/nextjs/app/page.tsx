"use client";

import Link from "next/link";
import { describeScheduledOperation } from "@sh/core/governance/proposalTypes";
import { SetupNotice } from "~~/components/SetupNotice";
import { GOVERNANCE_ROUTES, type GovernanceConfig, resolveGovernanceConfig } from "~~/config/governanceConfig";
import { useProposals } from "~~/hooks/mirror/useProposals";
import { useTreasuryFigures } from "~~/hooks/mirror/useTreasuryFigures";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { approvalsLabel, proposalStatusLabel } from "~~/services/governance/proposalLabels";
import { SAUCERSWAP_V2_CONFIG } from "~~/services/swap/saucerSwapConfig";
import { formatTinybars } from "~~/utils/scaffold-hbar/hbarAmount";

export default function GovernanceHomePage() {
  const { targetNetwork } = useTargetNetwork();
  let config: GovernanceConfig;
  try {
    config = resolveGovernanceConfig(targetNetwork.id);
  } catch (error) {
    return <SetupNotice error={error} />;
  }
  return <GovernanceHome config={config} />;
}

function GovernanceHome({ config }: { config: GovernanceConfig }) {
  const { network, governanceAccountId, demoTokenId } = config;
  const executorContractId = config.executor.hederaContractId;
  const usdcTokenId = SAUCERSWAP_V2_CONFIG[network].usdcToken;

  const { inbox, council } = useProposals({ governanceAccountId, executorContractId, network });
  const treasury = useTreasuryFigures({
    governanceAccountId,
    vaultContractId: config.vault.hederaContractId,
    demoTokenId,
    usdcTokenId,
    network,
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
            {treasury.data ? formatTinybars(treasury.data.hbarBalanceTinybar) : "…"}
          </div>
        </div>
        <div className="stat">
          <div className="stat-title">Vault reserve</div>
          <div className="stat-value text-lg">
            {treasury.data ? formatTinybars(treasury.data.vaultReserveTinybar) : "…"}
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
          <div className="flex items-center justify-between gap-3">
            <h2 className="card-title text-base">Pending proposals</h2>
            <Link href={GOVERNANCE_ROUTES.newProposal} className="btn btn-primary btn-sm">
              New proposal
            </Link>
          </div>
          {inbox.data && inbox.data.unreachableProposers.length > 0 && (
            <p role="status" className="text-sm text-warning">
              This list may be incomplete: proposals from {inbox.data.unreachableProposers.join(", ")} could not be
              read.
            </p>
          )}
          {inbox.data?.proposals.length === 0 && <p className="text-sm text-base-content/60">No proposals yet.</p>}
          {!inbox.data && <span className="loading loading-spinner loading-sm" aria-label="Loading proposals" />}
          {inbox.data && inbox.data.proposals.length > 0 && (
            <ul className="flex flex-col gap-2">
              {inbox.data.proposals.map(proposal => (
                <li key={proposal.schedule.schedule_id}>
                  <Link href={GOVERNANCE_ROUTES.proposal(proposal.schedule.schedule_id)} className="link link-primary">
                    {describeScheduledOperation(proposal.operation)} — {proposalStatusLabel(proposal)} —{" "}
                    {approvalsLabel(proposal.progress, proposal.incomingProgress)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
