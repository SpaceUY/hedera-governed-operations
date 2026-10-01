import { ROTATION_RESULT_COPY } from "./copy";
import type { CouncilKey } from "@sh/core/governance/council";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";

export type RotationResultFacts = {
  /** The council the rotation installed. */
  incoming: CouncilKey;
  /** The council just before it ran: undefined while it is read, null when it could not be. */
  before: CouncilKey | null | undefined;
  /** The co-signing agent's seat, when the app knows it. */
  agentSeat: string | null;
};

/**
 * What an executed council rotation did, as its result's title: that it seated the co-signing agent —
 * only when the agent's key is in the council it made and was not in the one before — or else simply
 * what the council is now. Null while the council before is still being read.
 */
export function rotationResultTitle({ incoming, before, agentSeat }: RotationResultFacts): string | null {
  if (before === undefined) return null;
  const rule = councilRuleLabel(incoming);
  const seatedTheAgent =
    agentSeat !== null && incoming.memberKeys.includes(agentSeat) && !!before && !before.memberKeys.includes(agentSeat);
  return seatedTheAgent ? ROTATION_RESULT_COPY.agentSeated(rule) : ROTATION_RESULT_COPY.councilNow(rule);
}
