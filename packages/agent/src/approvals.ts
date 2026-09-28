/**
 * The proposals waiting on a person, and the codes that release them.
 *
 * The policy says which operations the agent may sign on its own and which ones need a human to say
 * so as well. This is the second half: what it remembers between a decision it would not take alone
 * and the confirmation code that lets it.
 *
 * **It is process memory, like `signedThisRun`.** Restarting the agent loses every approval that had
 * not been acted on yet, and that is the right failure: the cost is asking for a code again, and the
 * alternative — a confirmation that survives in a file — is an approval nobody watched being made
 * still standing after the process that asked for it is gone.
 */
import { matchingTotpStep } from "./totp";

/**
 * How long a confirmation keeps releasing signatures. The agent signs on the pass after the code
 * arrives, seconds later, so this only matters when signing keeps failing — and a code somebody
 * typed a quarter of an hour ago should not still be authorising a transaction then. When it lapses
 * the proposal goes back to waiting, and the next code starts a fresh window.
 */
export const CONFIRMATION_TTL_MS = 15 * 60 * 1000;

/**
 * What came of a code. Each one is a different thing to tell whoever sent it: nothing is waiting
 * under that id, it was already released, or the code itself was not accepted.
 */
export type ConfirmationOutcome = "confirmed" | "unknown" | "alreadyConfirmed" | "rejected";

export type ApprovalStore = {
  /**
   * Record that a proposal is waiting on a person. Calling it again for one already waiting changes
   * nothing, which is what lets it run on every pass over the inbox.
   *
   * **This is where a notification belongs.** A deployment that wants the operator told by mail or
   * chat rather than by reading the log hangs it here, on the transition into waiting.
   */
  awaitConfirmation(scheduleId: string): void;
  /** Check a code against the clock and release the proposal it names. */
  confirm(scheduleId: string, code: string, now: Date): ConfirmationOutcome;
  /** The proposals a person has released and whose confirmation has not lapsed. */
  confirmed(now: Date): ReadonlySet<string>;
  /** Drop everything about proposals that have left the council's inbox. */
  forgetOutside(inInbox: ReadonlySet<string>): void;
};

const isLive = (confirmedAt: Date | null, now: Date): boolean =>
  confirmedAt !== null && now.getTime() - confirmedAt.getTime() < CONFIRMATION_TTL_MS;

/**
 * The secret may be null, which is the shape of an agent whose policy escalates nothing. It is a
 * null rather than an empty secret because an empty key is a real HMAC key: codes generated from it
 * would verify, and the store would release proposals on a secret anybody can guess.
 */
export function createApprovalStore(secret: Uint8Array | null): ApprovalStore {
  /** Schedule id to when a person released it, or null while it is still waiting for a code. */
  const waiting = new Map<string, Date | null>();

  /**
   * The last time step a code was accepted from, and the whole replay guard: a code stays valid for
   * its window, so without this the same six digits — read over the operator's shoulder, or out of a
   * proxy log — would release a second proposal a few seconds later.
   *
   * It is deliberately one counter for the whole agent rather than one per proposal. A code is
   * generated from the clock and the secret and says nothing about which proposal it is for, so a
   * counter per proposal would let a code captured for one release another inside the same window,
   * which is exactly the attack. The cost is that confirming two proposals means waiting for the
   * next step.
   */
  let lastAcceptedStep = -1;

  return {
    awaitConfirmation(scheduleId) {
      if (!waiting.has(scheduleId)) waiting.set(scheduleId, null);
    },

    confirm(scheduleId, code, now) {
      if (secret === null) return "rejected";
      if (!waiting.has(scheduleId)) return "unknown";
      if (isLive(waiting.get(scheduleId) ?? null, now)) return "alreadyConfirmed";

      const step = matchingTotpStep(code, secret, now);
      if (step === null || step <= lastAcceptedStep) return "rejected";

      lastAcceptedStep = step;
      waiting.set(scheduleId, now);
      return "confirmed";
    },

    confirmed(now) {
      const live = new Set<string>();
      for (const [scheduleId, confirmedAt] of waiting) if (isLive(confirmedAt, now)) live.add(scheduleId);
      return live;
    },

    forgetOutside(inInbox) {
      for (const scheduleId of waiting.keys()) if (!inInbox.has(scheduleId)) waiting.delete(scheduleId);
    },
  };
}
