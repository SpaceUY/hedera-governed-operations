/**
 * Who holds a council seat, named the way the map names it, for every screen that lists the council:
 * the rail's approver lists and Settings. A seat is a key; the account behind it is known when a
 * proposer holds that key or when it is the co-signing agent's.
 */
import { AGENT_COPY } from "./copy";
import type { CouncilKey, Proposer } from "@sh/core/governance/council";
import type { MemberName } from "~~/components/governance/graph/mapModel";
import type { CoSigningAgent } from "~~/hooks/useCoSigningAgent";
import { memberLabel } from "~~/services/governance/proposalLabels";

export type SeatNaming = {
  proposers: readonly Proposer[];
  viewerAccountId: string | null;
  /** The seats as the map names them, by key; a seat the map does not show falls back to `memberLabel`. */
  memberNames?: Readonly<Record<string, MemberName>>;
  /** The co-signing agent, when the app knows its account: the seat its key holds is named as the agent. */
  agent?: CoSigningAgent | null;
};

export type CouncilSeat = { name: string; caption?: string; monogram?: string; accountId?: string; isViewer: boolean };

export function councilSeatOf(
  key: string,
  { proposers, viewerAccountId, memberNames = {}, agent }: SeatNaming,
): CouncilSeat {
  const isAgent = agent?.seat === key;
  const accountId =
    proposers.find(proposer => proposer.key === key)?.accountId ?? (isAgent ? agent.accountId : undefined);
  return {
    name: isAgent ? AGENT_COPY.name : (memberNames[key]?.name ?? memberLabel(key, proposers, viewerAccountId)),
    caption: isAgent ? undefined : memberNames[key]?.caption,
    monogram: isAgent ? AGENT_COPY.monogram : undefined,
    accountId,
    isViewer: accountId !== undefined && accountId === viewerAccountId,
  };
}

/**
 * The agent's seat while the council does not hold it. An agent whose key is not one public key can
 * never be seated, so it gets no row at all.
 */
export function unseatedAgentSeatOf(agent: CoSigningAgent | null, council: CouncilKey): string | null {
  if (!agent?.seat || council.memberKeys.includes(agent.seat)) return null;
  return agent.seat;
}

/** The council once that seat is added at the same threshold — what "Add the co-signing agent" proposes. */
export function withSeat(council: CouncilKey, seat: string): CouncilKey {
  return { threshold: council.threshold, memberKeys: [...council.memberKeys, seat] };
}
