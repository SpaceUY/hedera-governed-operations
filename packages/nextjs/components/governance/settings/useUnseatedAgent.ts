"use client";

import { useMemo } from "react";
import type { CouncilKey } from "@sh/core/governance/council";
import { unseatedAgentSeatOf } from "~~/components/governance/rail/councilSeats";
import { type AgentSeat, agentSeatOf } from "~~/components/governance/wizard/kinds/coSigningAgent/agentSeat";
import { useAccount } from "~~/hooks/mirror/useAccount";
import type { CoSigningAgent } from "~~/hooks/useCoSigningAgent";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

/** The co-signing agent's seat while the council does not hold it, and whether the agent could sign from it. */
export type UnseatedAgent = { seat: string; check: AgentSeat };

/**
 * The unseated agent, checked once for every card on the screen: the council card says why it cannot be
 * seated when it cannot, and the composer offers its seat only when it can. The account is the query
 * `useCoSigningAgent` already read, so this asks the Mirror Node nothing new.
 */
export function useUnseatedAgent(
  agent: CoSigningAgent | null,
  council: CouncilKey | undefined,
  network: HederaNetworkName,
): UnseatedAgent | null {
  const seat = council ? unseatedAgentSeatOf(agent, council) : null;
  const accountId = seat ? (agent?.accountId ?? null) : null;
  const account = useAccount(accountId, { network });
  return useMemo(() => {
    if (!seat || !accountId || !council) return null;
    return {
      seat,
      check: agentSeatOf(
        accountId,
        { account: account.data, error: account.error },
        { council, configuredAgentId: accountId },
      ),
    };
  }, [seat, accountId, council, account.data, account.error]);
}
