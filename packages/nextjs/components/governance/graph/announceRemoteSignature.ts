import { remoteSignatureMessage } from "./copy";
import type { ComposedMap } from "./mapModel";
import { describeScheduledOperation } from "@sh/core/governance/proposalTypes";
import { memberNodeId } from "~~/services/governance/graph";
import type { GovernanceSnapshot } from "~~/services/governance/mapEvents";
import type { ApprovedEvent } from "~~/services/liveMap/remoteApprovals";
import { notification } from "~~/utils/scaffold-hbar/notification";

const TOAST_MS = 6_000;

/**
 * Says, in a toast, that a council member signed from somewhere else: the seat by its name on the
 * map ("Bob", "You"), the proposal as the rail describes it.
 */
export function announceRemoteSignature(
  approval: ApprovedEvent,
  { map, world }: { map: ComposedMap | null; world: GovernanceSnapshot | null },
): void {
  const member = map?.graph.nodes.find(node => node.id === memberNodeId(approval.memberKey))?.label;
  const proposal = world?.proposals.find(({ schedule }) => schedule.schedule_id === approval.scheduleId);
  const what = proposal ? describeScheduledOperation(proposal.operation) : approval.scheduleId;
  notification.info(remoteSignatureMessage(member, what), { duration: TOAST_MS });
}
