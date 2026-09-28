"use client";

import { type ReactNode, createContext, useCallback, useContext } from "react";
import { useRouter } from "next/navigation";
import { ProposalWizardProvider } from "~~/components/governance/wizard/ProposalWizardProvider";
import { GOVERNANCE_ROUTES, type GovernanceConfig } from "~~/config/governanceConfig";

const GovernanceConfigContext = createContext<GovernanceConfig | null>(null);

type GovernanceProviderProps = { config: GovernanceConfig; children: ReactNode };

/**
 * What every governance screen shares, provided once by the governance layout: the resolved
 * configuration, and the wizard's draft and submit, so the map beside the rail can draw the proposal
 * being drafted and a submission survives the rail changing route. A layout cannot pass props to the
 * page it renders, which is why this is a context rather than props.
 */
export const GovernanceProvider = ({ config, children }: GovernanceProviderProps) => {
  const router = useRouter();
  // Stable, so the wizard's context value does not change on every render of the layout.
  const openSubmitted = useCallback(
    (scheduleId: string) => router.push(GOVERNANCE_ROUTES.proposal(scheduleId)),
    [router],
  );

  return (
    <GovernanceConfigContext.Provider value={config}>
      <ProposalWizardProvider executorContractId={config.executor.hederaContractId} onSubmitted={openSubmitted}>
        {children}
      </ProposalWizardProvider>
    </GovernanceConfigContext.Provider>
  );
};

/** The configuration the governance layout resolved; only a screen inside that layout can ask for it. */
export function useGovernanceConfig(): GovernanceConfig {
  const config = useContext(GovernanceConfigContext);
  if (!config) throw new Error("useGovernanceConfig must be used inside the governance layout");
  return config;
}
