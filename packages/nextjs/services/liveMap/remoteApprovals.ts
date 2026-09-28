/**
 * Which approvals a read reports that this session did not send. A signature from another device
 * animates exactly like one sent from here — the map only ever sees reads — so the only thing that
 * tells them apart is what this session itself submitted, which the caller reads from the query
 * cache. Pure, so the rule is tested without React.
 */
import { type AnimationEvent, type GovernanceSnapshot } from "~~/services/liveMap/events/mapEvents";

export type ApprovedEvent = Extract<AnimationEvent, { kind: "approved" }>;

/** What this session has submitted, as its mutations record it. */
export type SessionWrites = {
  /** The connected account, or null. */
  accountId: string | null;
  /** Schedules this session signed (submitted or done; not failed). */
  signed: readonly string[];
  /** Schedules this session opened. */
  opened: readonly string[];
  /** Whether this session is opening a proposal whose schedule id it does not know yet. */
  opening: boolean;
};

/**
 * The approvals in `events` that did not come from this session, oldest first.
 *
 * An approval is this session's when it is on a schedule this session signed — or opened, since the
 * creator's own approval arrives together with `proposed` — and it is by the connected account's
 * seat. That seat is known through the proposer list, the only accounts whose keys the map reads: a
 * proposer's own approvals are the ones by its key (none, when its key holds no seat); for any other
 * account every approval on a schedule this session signed or opened counts as its own, since there
 * is no telling them apart. A proposal read before the session learnt its schedule id (Mirror indexed
 * it while the wallet was still answering) is matched by its creator instead.
 */
export function remoteApprovals(
  events: readonly AnimationEvent[],
  session: SessionWrites,
  world: GovernanceSnapshot,
): ApprovedEvent[] {
  const proposer = world.proposers.find(({ accountId }) => accountId === session.accountId);
  const proposedNow = events.filter(({ kind }) => kind === "proposed").map(({ scheduleId }) => scheduleId);
  const openedBy = (scheduleId: string) =>
    world.proposals.find(({ schedule }) => schedule.schedule_id === scheduleId)?.schedule.creator_account_id;

  const isOwn = ({ scheduleId, memberKey }: ApprovedEvent): boolean => {
    if (proposer && proposer.key !== memberKey) return false;
    if (session.signed.includes(scheduleId) || session.opened.includes(scheduleId)) return true;
    return session.opening && proposedNow.includes(scheduleId) && openedBy(scheduleId) === session.accountId;
  };

  return events.filter((event): event is ApprovedEvent => event.kind === "approved" && !isOwn(event));
}
