const TONE_CLASSES = {
  plain: "border-base-content/30",
  signed: "border-success",
  ghost: "border-dashed border-base-content/30 text-base-content/60",
} as const;

/** A council seat's round avatar: its monogram, ringed green once it signed, dashed while it holds no seat. */
export const SeatAvatar = ({ label, tone }: { label: string; tone: keyof typeof TONE_CLASSES }) => (
  <span
    aria-hidden="true"
    className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${TONE_CLASSES[tone]}`}
  >
    {label}
  </span>
);
