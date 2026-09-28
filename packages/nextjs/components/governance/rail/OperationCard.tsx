"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { expiryCountdown } from "./expiryCountdown";
import { describeScheduledOperation } from "@sh/core/governance/proposalTypes";
import type { Proposal } from "@sh/core/governance/proposals";
import { GOVERNANCE_ROUTES } from "~~/config/governanceConfig";
import { approvalsLabel, proposalStatusLabel, registryLabel } from "~~/services/governance/proposalLabels";

/** The id of a card's button, so a host can move focus to the card wherever it is rendered now. */
export function operationCardButtonId(scheduleId: string): string {
  return `proposal-card-${scheduleId}`;
}

function operationCardDetailId(scheduleId: string): string {
  return `proposal-card-detail-${scheduleId}`;
}

export type OperationCardProps = {
  proposal: Proposal;
  selected: boolean;
  onSelect: () => void;
  /** Shown under the row while it is selected: the host's proposal detail. */
  detail?: ReactNode;
};

/**
 * One proposal, as a row in the rail: what it is, its status, its approvals and, while it is still
 * collecting signatures, how long it has left. The row is a disclosure: selecting highlights it and
 * reports it to the host, which is what keeps the URL in sync (`useSelectedSchedule`), and opens the
 * host's `detail` under it (`aria-expanded`, `aria-controls`). A row that is not open also offers
 * "View details", a separate link to the full page, so a click on the row itself never navigates
 * away and never scrolls; an open row already shows that detail.
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
  const scheduleId = proposal.schedule.schedule_id;
  const detailId = operationCardDetailId(scheduleId);
  const isOpen = selected && Boolean(detail);

  return (
    <li className={`m-0 rounded-lg border ${selected ? "border-primary bg-primary/10" : "border-base-300"}`}>
      <button
        id={operationCardButtonId(scheduleId)}
        type="button"
        aria-expanded={isOpen}
        aria-controls={isOpen ? detailId : undefined}
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
      {!isOpen && (
        <Link href={GOVERNANCE_ROUTES.proposal(scheduleId)} className="link link-primary block px-3 pb-2 text-xs">
          View details →
        </Link>
      )}
      {isOpen && (
        <div id={detailId} className="border-t border-base-300">
          {detail}
        </div>
      )}
    </li>
  );
};
