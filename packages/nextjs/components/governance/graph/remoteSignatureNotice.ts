import { remoteSignatureMessage } from "./copy";
import type { ComposedMap } from "./mapModel";
import { describeScheduledOperation } from "@sh/core/governance/proposalTypes";
import type { GovernanceSnapshot } from "~~/services/liveMap/events/mapEvents";
import { memberNodeId } from "~~/services/liveMap/model/graph";
import type { ApprovedEvent } from "~~/services/liveMap/remoteApprovals";

/**
 * What to say about a signature a council member sent from somewhere else: the seat by its name on
 * the map ("Bob", "You"), the proposal as the rail describes it.
 */
export function remoteSignatureNotice(
  approval: ApprovedEvent,
  { map, world }: { map: ComposedMap | null; world: GovernanceSnapshot | null },
): string {
  const member = map?.graph.nodes.find(node => node.id === memberNodeId(approval.memberKey))?.label;
  const proposal = world?.proposals.find(({ schedule }) => schedule.schedule_id === approval.scheduleId);
  const what = proposal ? describeScheduledOperation(proposal.operation) : approval.scheduleId;
  return remoteSignatureMessage(member, what);
}
