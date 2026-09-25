"use client";

import Link from "next/link";
import { Hbar } from "@hiero-ledger/sdk";
import { SetupNotice } from "~~/components/SetupNotice";
import { getDeployedContract, getGovernanceEntityIds } from "~~/config/governanceConfig";
import { useProposals } from "~~/hooks/mirror/useProposals";
import { useTreasuryFigures } from "~~/hooks/mirror/useTreasuryFigures";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { approvalsLabel, scheduleStatusLabel } from "~~/services/governance/proposalLabels";
import { describeScheduledOperation } from "~~/services/governance/proposalTypes";
import { SAUCERSWAP_V2_CONFIG } from "~~/services/swap/saucerSwapConfig";
import { type HederaNetworkName, getHederaNetworkNameFromChainId } from "~~/utils/scaffold-hbar/networks";

type GovernanceHomeProps = {
  network: HederaNetworkName;
  governanceAccountId: string;
  demoTokenId: string;
  vaultContractId: string;
  executorContractId: string;
};

export default function GovernanceHomePage() {
  const { targetNetwork } = useTargetNetwork();
  let props: GovernanceHomeProps;
  try {
    const { governanceAccountId, demoTokenId } = getGovernanceEntityIds();
    props = {
      network: getHederaNetworkNameFromChainId(targetNetwork.id),
      governanceAccountId,
      demoTokenId,
      vaultContractId: getDeployedContract(targetNetwork.id, "AcmeVault").hederaContractId,
      executorContractId: getDeployedContract(targetNetwork.id, "GovernedExecutor").hederaContractId,
    };
  } catch (error) {
    return <SetupNotice error={error} />;
  }
  return <GovernanceHome {...props} />;
}

function GovernanceHome({
  network,
  governanceAccountId,
  demoTokenId,
  vaultContractId,
  executorContractId,
}: GovernanceHomeProps) {
  const usdcTokenId = SAUCERSWAP_V2_CONFIG[network].usdcToken;

  const { inbox, council } = useProposals({ governanceAccountId, executorContractId });
  const treasury = useTreasuryFigures({
    governanceAccountId,
    vaultContractId,
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
            {treasury.data ? Hbar.fromTinybars(treasury.data.hbarBalanceTinybar).toString() : "…"}
          </div>
        </div>
        <div className="stat">
          <div className="stat-title">Vault reserve</div>
          <div className="stat-value text-lg">
            {treasury.data ? Hbar.fromTinybars(treasury.data.vaultReserveTinybar.toString()).toString() : "…"}
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
                  <Link href={`/governance/${proposal.schedule.schedule_id}`} className="link link-primary">
                    {describeScheduledOperation(proposal.operation)} — {scheduleStatusLabel(proposal.state.status)} —{" "}
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
