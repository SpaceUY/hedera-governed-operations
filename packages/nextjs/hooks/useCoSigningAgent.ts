"use client";

import { memberKeyOfAccount } from "@sh/core/governance/council";
import { getCoSigningAgentAccountId } from "~~/config/governanceConfig";
import { useAccount } from "~~/hooks/mirror/useAccount";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

/** The co-signing agent's account, and the seat its key would be (null when it is not one public key). */
export type CoSigningAgent = { accountId: string; seat: string | null };

/**
 * The co-signing agent the app was told about (`NEXT_PUBLIC_CO_SIGNING_AGENT_ACCOUNT_ID`), with its key
 * read from the Mirror Node so a screen can tell whether it holds a seat. Null when no agent is
 * configured, and until its account has been read, so nothing flashes as "not seated" meanwhile.
 */
export function useCoSigningAgent(network: HederaNetworkName): CoSigningAgent | null {
  const accountId = getCoSigningAgentAccountId();
  const account = useAccount(accountId, { network });
  if (!accountId || !account.data) return null;
  return { accountId, seat: memberKeyOfAccount(account.data.key) };
}
