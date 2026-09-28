"use client";

import { useState } from "react";
import { OperationCard } from "./OperationCard";
import { pendingSummaryLabel, resolveCollapse } from "./pendingCollapse";
import type { Proposal } from "@sh/core/governance/proposals";

export type PendingOperationsListProps = {
  proposals: Proposal[];
  selectedScheduleId: string | null;
  onSelect: (scheduleId: string) => void;
};

/**
 * The pending section, collapsed to its summary count with the first few rows expanded and a "show
 * more" control for the rest (U2). A row the URL already points at is never one of the hidden ones:
 * `resolveCollapse` forces the list open when the selection sits past the fold, so a direct link or
 * the schedule-id search never lands on a card nothing shows.
 */
export const PendingOperationsList = ({ proposals, selectedScheduleId, onSelect }: PendingOperationsListProps) => {
  const [expanded, setExpanded] = useState(false);
  const selectedIndex = proposals.findIndex(proposal => proposal.schedule.schedule_id === selectedScheduleId);
  const { visibleCount, hiddenCount } = resolveCollapse(proposals.length, expanded, selectedIndex);

  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-xs font-semibold text-base-content/60">{pendingSummaryLabel(proposals.length)}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {proposals.slice(0, visibleCount).map(proposal => (
          <OperationCard
            key={proposal.schedule.schedule_id}
            proposal={proposal}
            selected={proposal.schedule.schedule_id === selectedScheduleId}
            onSelect={() => onSelect(proposal.schedule.schedule_id)}
          />
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button type="button" className="btn btn-ghost btn-xs self-start" onClick={() => setExpanded(true)}>
          Show {hiddenCount} more
        </button>
      )}
      {expanded && (
        <button type="button" className="btn btn-ghost btn-xs self-start" onClick={() => setExpanded(false)}>
          Show fewer
        </button>
      )}
    </div>
  );
};
