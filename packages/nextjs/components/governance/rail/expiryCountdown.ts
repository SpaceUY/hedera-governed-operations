/**
 * A pending proposal's time left before it expires, so a card can say how urgent it is without the
 * council having to open the detail page. Only a pending schedule has one to show: a settled schedule
 * either ran or is already done waiting.
 */
export type ExpiryUrgency = "normal" | "final-hour";

export type ExpiryCountdown = { label: string; urgency: ExpiryUrgency };

/** Below this much time left, the countdown intensifies rather than just ticking down. */
const FINAL_HOUR_MS = 60 * 60 * 1000;

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function expiryCountdown(
  expiresAt: Date | null,
  isPending: boolean,
  now: Date = new Date(),
): ExpiryCountdown | null {
  if (!isPending || !expiresAt) return null;
  const remainingMs = expiresAt.getTime() - now.getTime();
  if (remainingMs <= 0) return { label: "Expiring now", urgency: "final-hour" };
  return {
    label: `Expires in ${formatDuration(remainingMs)}`,
    urgency: remainingMs <= FINAL_HOUR_MS ? "final-hour" : "normal",
  };
}
