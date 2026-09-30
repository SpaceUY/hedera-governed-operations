"use client";

import { type ReactNode, useState } from "react";
import { OperationCard } from "./OperationCard";
import { PENDING_LIST_COPY } from "./copy";
import { expandedList, foldedList } from "./pendingCollapse";
import type { Proposal } from "@sh/core/governance/proposals";

export type PendingOperationsListProps = {
  proposals: Proposal[];
  selectedScheduleId: string | null;
  onSelect: (scheduleId: string) => void;
  /** The selected proposal's detail, opened under its card. */
  selectedDetail?: ReactNode;
  /** The proposals the map is still playing, whose cards say they are confirming. */
  confirmingScheduleIds?: readonly string[];
};

/**
 * The pending section: the first few rows, and a "show more" control for the rest (U2); the host
 * heads it with the count. A row the URL already points at is never one of the hidden ones:
 * `foldedList` opens the list when the selection sits past the fold, so a direct link or the
 * schedule-id search never lands on a card nothing shows. Folding it back from there is the reader's
 * call, and holds until the selection moves.
 */
export const PendingOperationsList = ({
  proposals,
  selectedScheduleId,
  onSelect,
  selectedDetail,
  confirmingScheduleIds = [],
}: PendingOperationsListProps) => {
  const [expanded, setExpanded] = useState(false);
  // The selection the reader folded the list over: it no longer holds the list open.
  const [foldedOver, setFoldedOver] = useState<string | null>(null);
  const selectedIndex =
    selectedScheduleId === foldedOver
      ? -1
      : proposals.findIndex(proposal => proposal.schedule.schedule_id === selectedScheduleId);
  const { visibleCount, hiddenCount, canFold } = expanded
    ? expandedList(proposals.length)
    : foldedList(proposals.length, selectedIndex);

  const fold = () => {
    setExpanded(false);
    setFoldedOver(selectedScheduleId);
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {proposals.slice(0, visibleCount).map(proposal => (
          <OperationCard
            key={proposal.schedule.schedule_id}
            proposal={proposal}
            selected={proposal.schedule.schedule_id === selectedScheduleId}
            onSelect={() => onSelect(proposal.schedule.schedule_id)}
            detail={selectedDetail}
            confirming={confirmingScheduleIds.includes(proposal.schedule.schedule_id)}
          />
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button type="button" className="btn btn-ghost btn-xs self-start" onClick={() => setExpanded(true)}>
          {PENDING_LIST_COPY.showMore(hiddenCount)}
        </button>
      )}
      {canFold && (
        <button type="button" className="btn btn-ghost btn-xs self-start" onClick={fold}>
          {PENDING_LIST_COPY.showFewer}
        </button>
      )}
    </div>
  );
};
