/**
 * Which approvals a read reports that this session did not send. A signature from another device
 * animates exactly like one sent from here — the map only ever sees reads — so the only thing that
 * tells them apart is what this session itself submitted, which the caller reads from the query
 * cache. Pure, so the rule is tested without React.
 */
import { type AnimationEvent, type GovernanceSnapshot } from "~~/services/liveMap/events/mapEvents";

export type ApprovedEvent = Extract<AnimationEvent, { kind: "approved" }>;

/** A signature this session asked for on another seat's behalf: which schedule, and by which key. */
export type SignedAs = { scheduleId: string; memberKey: string };

/** What this session has submitted, as its mutations record it. */
export type SessionWrites = {
  /** The connected account, or null. */
  accountId: string | null;
  /**
   * The connected account's key as a council seat writes it (`memberKeyOfAccount`), once read; null
   * while it is being read, and for an account whose key is not one public key.
   */
  memberKey: string | null;
  /** Schedules this session signed (submitted or done; not failed). */
  signed: readonly string[];
  /** Signatures this session asked the server to add for another seat — a demo co-signer (submitted or done; not failed). */
  signedAs: readonly SignedAs[];
  /** Schedules this session opened. */
  opened: readonly string[];
  /** Whether this session is opening a proposal whose schedule id it does not know yet. */
  opening: boolean;
};

/**
 * The approvals in `events` that did not come from this session, oldest first.
 *
 * An approval is this session's when it is by the connected account's own key and on a schedule this
 * session signed — or opened, since the creator's own approval arrives together with `proposed`. Until
 * that key is read, every approval on a schedule this session signed or opened counts as its own, so
 * nothing is announced that this session may have sent. A signature this session asked the server to add
 * for another seat (`signedAs`) is its own too, for that schedule and that key only. A proposal read before the session learnt its
 * schedule id (Mirror indexed it while the wallet was still answering) is matched by its creator.
 */
export function remoteApprovals(
  events: readonly AnimationEvent[],
  session: SessionWrites,
  world: GovernanceSnapshot,
): ApprovedEvent[] {
  const proposedNow = events.filter(({ kind }) => kind === "proposed").map(({ scheduleId }) => scheduleId);
  const openedBy = (scheduleId: string) =>
    world.proposals.find(({ schedule }) => schedule.schedule_id === scheduleId)?.schedule.creator_account_id;

  const isOwn = ({ scheduleId, memberKey }: ApprovedEvent): boolean => {
    if (session.signedAs.some(own => own.scheduleId === scheduleId && own.memberKey === memberKey)) return true;
    if (session.memberKey !== null && session.memberKey !== memberKey) return false;
    if (session.signed.includes(scheduleId) || session.opened.includes(scheduleId)) return true;
    return session.opening && proposedNow.includes(scheduleId) && openedBy(scheduleId) === session.accountId;
  };

  return events.filter((event): event is ApprovedEvent => event.kind === "approved" && !isOwn(event));
}
