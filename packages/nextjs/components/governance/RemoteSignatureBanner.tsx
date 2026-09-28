"use client";

import { useCallback, useEffect, useState } from "react";
import { REMOTE_SIGNATURE_BANNER } from "~~/components/governance/graph/copy";

/** How long a banner stays before it clears itself. */
const BANNER_MS = 8_000;

type Notice = { id: number; text: string };

/**
 * The latest signature from elsewhere, as the banner shows it: `show` is what `LiveMapPane` calls
 * (`onRemoteSignature`), and the notice clears itself after a while or when dismissed. A newer one
 * replaces it and starts its own clock.
 */
export function useRemoteSignatureNotice() {
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

type RemoteSignatureBannerProps = { notice: Notice | null; onDismiss: () => void };

/**
 * A council member signed from somewhere else, and the map played it: said at the top of the rail,
 * where the proposals it concerns are listed. A polite status, so a screen reader hears it without
 * losing its place.
 */
export function RemoteSignatureBanner({ notice, onDismiss }: RemoteSignatureBannerProps) {
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
            aria-label={REMOTE_SIGNATURE_BANNER.dismiss}
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
