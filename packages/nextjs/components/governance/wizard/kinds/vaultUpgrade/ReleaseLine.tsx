"use client";

import { type ReleaseCheckState, VAULT_UPGRADE_COPY } from "./copy";
import type { ManifestCheck } from "@sh/core/governance/releaseManifest";
import { useReleaseCheck } from "~~/hooks/mirror/useReleaseCheck";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

type ReleaseLineProps = {
  implementation: string;
  /** Null when no release topic is configured, which hides the line. */
  topicId: string | null;
  network: HederaNetworkName;
};

const TONE: Record<"vouched" | "notVouched" | "pending", string> = {
  vouched: "text-success",
  notVouched: "text-warning",
  pending: "text-base-content/60",
};

const toneOf = (state: ReleaseCheckState): string => {
  if (state.status === "loading") return TONE.pending;
  if (state.status === "read" && state.check.matched) return TONE.vouched;
  return TONE.notVouched;
};

const stateOf = ({ data, isError }: { data: ManifestCheck | undefined; isError: boolean }): ReleaseCheckState => {
  if (data) return { status: "read", check: data };
  if (isError) return { status: "unreadable" };
  return { status: "loading" };
};

/**
 * Whether a published release vouches for the implementation, read the way the co-signing agent
 * reads it. Information only: it never holds the draft back — the agent is what refuses.
 */
export const ReleaseLine = ({ implementation, topicId, network }: ReleaseLineProps) => {
  const query = useReleaseCheck(implementation, topicId, { network });
  if (!topicId) return null;

  const state = stateOf(query);

  return (
    <p role="status" className={`m-0 text-sm leading-normal ${toneOf(state)}`}>
      {VAULT_UPGRADE_COPY.release(state, topicId)}{" "}
      <a
        className="link text-base-content/60"
        href={`https://hashscan.io/${network}/topic/${topicId}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {VAULT_UPGRADE_COPY.releaseTopicLink}
      </a>
    </p>
  );
};
