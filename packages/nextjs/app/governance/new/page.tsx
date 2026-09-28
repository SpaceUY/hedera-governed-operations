"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SetupNotice } from "~~/components/SetupNotice";
import { ProposalWizard } from "~~/components/governance/wizard/ProposalWizard";
import { ProposalWizardProvider } from "~~/components/governance/wizard/ProposalWizardProvider";
import { GOVERNANCE_ROUTES, type GovernanceConfig, resolveGovernanceConfig } from "~~/config/governanceConfig";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";

export default function NewProposalPage() {
  const router = useRouter();
  const { targetNetwork } = useTargetNetwork();
  let config: GovernanceConfig;
  try {
    config = resolveGovernanceConfig(targetNetwork.id);
  } catch (error) {
    return <SetupNotice error={error} />;
  }

  return (
    <ProposalWizardProvider
      executorContractId={config.executor.hederaContractId}
      onSubmitted={scheduleId => router.push(GOVERNANCE_ROUTES.proposal(scheduleId))}
    >
      <div className="w-full max-w-[548px] mx-auto flex flex-1 flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-base-300">
          <Link
            href={GOVERNANCE_ROUTES.home}
            className="btn btn-outline btn-sm"
            aria-label="Back to the governance home"
          >
            ← Home
          </Link>
          <h1 className="m-0 text-base font-bold">New proposal</h1>
        </div>
        <div className="flex-1">
          <ProposalWizard config={config} chain={targetNetwork} headingLevel={2} />
        </div>
      </div>
    </ProposalWizardProvider>
  );
}
