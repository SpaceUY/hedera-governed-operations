"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { expiryCountdown } from "./expiryCountdown";
import { describeScheduledOperation } from "@sh/core/governance/proposalTypes";
import type { Proposal } from "@sh/core/governance/proposals";
import { GOVERNANCE_ROUTES } from "~~/config/governanceConfig";
import { approvalsLabel, proposalStatusLabel, registryLabel } from "~~/services/governance/proposalLabels";

export type OperationCardProps = {
  proposal: Proposal;
  selected: boolean;
  onSelect: () => void;
  /** Shown under the row while it is selected: the host's proposal detail. */
  detail?: ReactNode;
};

/**
 * One proposal, as a row in the rail: what it is, its status, its approvals and, while it is still
 * collecting signatures, how long it has left. Selecting highlights the row and reports it to the
 * host, which is what keeps the URL in sync (`useSelectedSchedule`), and opens the host's `detail`
 * under it; "View details" is a separate link to the full page, so a click on the row itself never
 * navigates away and never scrolls.
 *
 * A scheduled body the decoder could not read has no other shape here to fall back on:
 * `describeScheduledOperation` already carries the reason, so the row shows exactly that, styled as a
 * warning rather than a plain description, and offers nothing that could be mistaken for a preview of
 * what it does.
 */
export const OperationCard = ({ proposal, selected, onSelect, detail }: OperationCardProps) => {
  const { operation, registry, state } = proposal;
  const isUnrecognized = operation.kind === "unrecognized";
  const countdown = expiryCountdown(state.expiresAt, state.status === "pending");

  return (
    <li className={`m-0 rounded-lg border ${selected ? "border-primary bg-primary/10" : "border-base-300"}`}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className="flex w-full flex-col gap-1 px-3 py-2 text-left"
      >
        <p className={`m-0 text-sm font-medium ${isUnrecognized ? "text-warning" : ""}`}>
          {describeScheduledOperation(operation)}
        </p>
        <p className="m-0 text-xs text-base-content/70">{proposalStatusLabel(proposal)}</p>
        {operation.kind === "registryCall" && (
          <p className="m-0 text-xs text-base-content/60">Registry entry: {registryLabel(registry)}</p>
        )}
        <p className="m-0 text-xs text-base-content/60">
          {approvalsLabel(proposal.progress, proposal.incomingProgress)}
        </p>
        {countdown && (
          <p
            className={`m-0 text-xs font-medium ${
              countdown.urgency === "final-hour" ? "animate-pulse text-error" : "text-base-content/60"
            }`}
          >
            {countdown.label}
          </p>
        )}
      </button>
      <Link
        href={GOVERNANCE_ROUTES.proposal(proposal.schedule.schedule_id)}
        className="link link-primary block px-3 pb-2 text-xs"
      >
        View details →
      </Link>
      {selected && detail && <div className="border-t border-base-300">{detail}</div>}
    </li>
  );
};
