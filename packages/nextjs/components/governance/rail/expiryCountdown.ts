import { EXPIRY_COPY, formatDuration } from "./copy";

/**
 * A pending proposal's time left before it expires, so a card can say how urgent it is without the
 * council having to open the detail page. Only a pending schedule has one to show — a settled schedule
 * either ran or is already done waiting — so callers ask for it only while the proposal is pending.
 */
export type ExpiryUrgency = "normal" | "final-hour";

export type ExpiryCountdown = { label: string; urgency: ExpiryUrgency };

/** Below this much time left, the countdown intensifies rather than just ticking down. */
const FINAL_HOUR_MS = 60 * 60 * 1000;

export function expiryCountdown(expiresAt: Date | null, now: Date = new Date()): ExpiryCountdown | null {
  if (!expiresAt) return null;
  const remainingMs = expiresAt.getTime() - now.getTime();
  if (remainingMs <= 0) return { label: EXPIRY_COPY.expiringNow, urgency: "final-hour" };
  return {
    label: EXPIRY_COPY.left(formatDuration(remainingMs)),
    urgency: remainingMs <= FINAL_HOUR_MS ? "final-hour" : "normal",
  };
}
