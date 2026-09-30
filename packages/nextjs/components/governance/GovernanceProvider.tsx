"use client";

import { type ReactNode, createContext, useCallback, useContext } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ProposalWizardProvider } from "~~/components/governance/wizard/ProposalWizardProvider";
import { SUBMITTED_NOTICE } from "~~/components/governance/wizard/copy";
import { GOVERNANCE_ROUTES, type GovernanceConfig } from "~~/config/governanceConfig";
import { DEFAULT_PENDING_POLL_MS } from "~~/hooks/mirror/mirrorQuery";
import { proposalInboxQueryKey } from "~~/hooks/mirror/useProposals";

const GovernanceConfigContext = createContext<GovernanceConfig | null>(null);

/** How long the hand-over waits for the inbox: no longer than one inbox poll, as the card appears by then anyway. */
const HAND_OVER_LIMIT_MS = DEFAULT_PENDING_POLL_MS;

type OpenSubmittedOptions = { network: GovernanceConfig["network"]; onNotice: (text: string) => void };

/** Waits for `pending`, but no longer than `ms`: a read that never answers must not hold a page back. */
async function settleWithin(pending: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<void>(resolve => {
    timer = setTimeout(resolve, ms);
  });
  try {
    await Promise.race([pending, limit]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * What happens once the wallet has sent a proposal: the rail says so, the inbox is read again, and
 * `/` opens with the new proposal selected — its card open in the rail, its preview on the map. The
 * read comes first so the card is already in the list when it opens.
 */
export function useOpenSubmitted({ network, onNotice }: OpenSubmittedOptions) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useCallback(
    async (scheduleId: string) => {
      onNotice(SUBMITTED_NOTICE);
      await settleWithin(queryClient.refetchQueries({ queryKey: proposalInboxQueryKey(network) }), HAND_OVER_LIMIT_MS);
      router.push(GOVERNANCE_ROUTES.selected(scheduleId));
    },
    [network, onNotice, queryClient, router],
  );
}

type GovernanceProviderProps = { config: GovernanceConfig; onNotice: (text: string) => void; children: ReactNode };

/**
 * What every governance screen shares, provided once by the governance layout: the resolved
 * configuration, and the wizard's draft and submit, so the map beside the rail can draw the proposal
 * being drafted and a submission survives the rail changing route. A layout cannot pass props to the
 * page it renders, which is why this is a context rather than props.
 */
export const GovernanceProvider = ({ config, onNotice, children }: GovernanceProviderProps) => {
  const openSubmitted = useOpenSubmitted({ network: config.network, onNotice });

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
