"use client";

import { useCallback, useEffect, useState } from "react";
import { RAIL_NOTICE } from "~~/components/governance/rail/copy";

/** How long a banner stays before it clears itself. */
const BANNER_MS = 8_000;

type Notice = { id: number; text: string };

/**
 * The rail's latest notice — a signature read from elsewhere, a proposal just sent — as the banner
 * shows it: `show` sets it, and it clears itself after a while or when dismissed. A newer one
 * replaces it and starts its own clock.
 */
export function useRailNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const show = useCallback((text: string) => setNotice(current => ({ id: (current?.id ?? 0) + 1, text })), []);
  const dismiss = useCallback(() => setNotice(null), []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(dismiss, BANNER_MS);
    return () => clearTimeout(timer);
  }, [notice, dismiss]);

  return { notice, show, dismiss };
}

type RailNoticeProps = { notice: Notice | null; onDismiss: () => void };

/**
 * Something the person should know that did not come from a click on this screen's rail — a council
 * member signed elsewhere, or the wallet sent a proposal — said at the top of the rail, where the
 * proposals are listed. A polite status, so a screen reader hears it without losing its place.
 */
export function RailNotice({ notice, onDismiss }: RailNoticeProps) {
  return (
    // Rendered even when empty, with no box of its own: a live region hidden with `display: none` is out
    // of the accessibility tree, and some screen readers miss what appears in it once it is shown.
    <div role="status">
      {notice && (
        <p className="mx-6 mb-0 mt-5 flex items-start gap-3 rounded-box border border-primary bg-primary/10 px-4 py-3 text-sm">
          <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
          <span className="flex-1">{notice.text}</span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={RAIL_NOTICE.dismiss}
            className="btn btn-circle btn-ghost btn-xs -my-0.5 shrink-0"
          >
            <svg viewBox="0 0 24 24" width={12} height={12} aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </button>
        </p>
      )}
    </div>
  );
}
