"use client";

import type { ReactNode } from "react";
import { OperationIcon } from "./OperationIcon";
import { OperationMeta } from "./OperationMeta";
import { proposalIdentityOf } from "./proposalIdentity";
import type { Proposal } from "@sh/core/governance/proposals";

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
 * One proposal, as a row in the rail: its kind's icon and title, whether it goes through the registry,
 * where it stands (three stage dots, then how many signatures it still needs or how it ended) and,
 * while it is still collecting signatures, how long it has left. The row is a disclosure: selecting
 * highlights it and reports it to the host, which is what keeps the URL in sync (`useSelectedSchedule`),
 * and opens the host's `detail` under it (`aria-expanded`, `aria-controls`, the chevron); a click on
 * the row never navigates away. Pointing at a closed row lifts its border and darkens it.
 *
 * A scheduled body the decoder could not read is named by the reason (`proposalIdentityOf`), styled
 * as a warning, and offers nothing that could be mistaken for a preview of what it does.
 */
export const OperationCard = ({ proposal, selected, onSelect, detail }: OperationCardProps) => {
  const identity = proposalIdentityOf(proposal);
  const scheduleId = proposal.schedule.schedule_id;
  const detailId = operationCardDetailId(scheduleId);
  const isOpen = selected && Boolean(detail);

  return (
    <li
      className={`m-0 overflow-hidden rounded-box border transition-colors motion-reduce:transition-none ${
        selected
          ? "border-primary bg-base-200"
          : "border-base-content/10 bg-base-200 hover:border-base-content/50 hover:bg-base-300"
      }`}
    >
      <button
        id={operationCardButtonId(scheduleId)}
        type="button"
        aria-expanded={isOpen}
        aria-controls={isOpen ? detailId : undefined}
        onClick={onSelect}
        className={`flex w-full cursor-pointer items-start gap-3 px-3 py-3 text-left ${selected ? "bg-primary/10" : ""}`}
      >
        <OperationIcon kind={identity.iconKind} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={`text-sm font-semibold ${identity.unrecognized ? "text-warning-ink" : ""}`}>
            {identity.title}
          </span>
          <OperationMeta proposal={proposal} family={identity.family} />
        </span>
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className={`mt-2 size-4 shrink-0 fill-none stroke-base-content/60 transition-transform motion-reduce:transition-none ${
            isOpen ? "rotate-180" : ""
          }`}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {isOpen && (
        <div id={detailId} className="border-t border-base-content/10">
          {detail}
        </div>
      )}
    </li>
  );
};
