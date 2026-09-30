"use client";

import { type FormEvent, type ReactNode, useEffect, useId, useState } from "react";
import { OperationCard } from "./OperationCard";
import { SEARCH_COPY } from "./copy";
import { isValidEntityId } from "@sh/core/mirror";
import { useProposalLookup } from "~~/hooks/mirror/useProposalLookup";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

export type ScheduleSearchProps = {
  governanceAccountId: string;
  executorContractId: string;
  network: HederaNetworkName;
  selectedScheduleId: string | null;
  /** A search found this id: select it. */
  onSelect: (scheduleId: string) => void;
  /** The result's card was pressed: open it, or close it if it is the open one, like any other card. */
  onToggle: (scheduleId: string) => void;
  /**
   * The selection, when the inbox does not list it — a link named it, or a search found it. It is shown
   * here, as the search result, and the field is filled in with it, so it is always clear why it is on
   * screen and it never sits among the inbox's own lists.
   */
  unlistedSelectionId: string | null;
  /** The selected proposal's detail, opened under the result's card while it is the selection. */
  selectedDetail: ReactNode;
  /**
   * Schedule ids the inbox already lists. A match there is already on screen as its own card, so the
   * search does not draw a second one for it.
   */
  knownScheduleIds: ReadonlySet<string>;
};

/**
 * Finds one proposal by schedule id directly, the same read the detail page uses
 * (`useProposalLookup`), so a proposal from an account outside `PROPOSER_ROLE` — never in the inbox,
 * since Mirror can only be asked for a proposer's own schedules — is still reachable.
 *
 * The result sits in the search landmark but outside the form: the detail it opens holds buttons of
 * its own (Sign, Withdraw, Cancel), which inside a form would submit the search.
 */
export const ScheduleSearch = ({
  governanceAccountId,
  executorContractId,
  network,
  selectedScheduleId,
  onSelect,
  onToggle,
  unlistedSelectionId,
  selectedDetail,
  knownScheduleIds,
}: ScheduleSearchProps) => {
  const inputId = useId();
  const [term, setTerm] = useState("");
  const [committedId, setCommittedId] = useState<string | null>(null);
  const [formatError, setFormatError] = useState<string | null>(null);

  useEffect(() => {
    if (!unlistedSelectionId) return;
    setTerm(unlistedSelectionId);
    setCommittedId(unlistedSelectionId);
    setFormatError(null);
  }, [unlistedSelectionId]);

  // Selecting any other card drops the search result, so its lookup stops polling a proposal nobody is
  // looking at. A functional update, because the effect above may have just committed this selection.
  useEffect(() => {
    setCommittedId(current => (selectedScheduleId && selectedScheduleId !== current ? null : current));
  }, [selectedScheduleId]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = term.trim();
    if (!isValidEntityId(trimmed)) {
      setCommittedId(null);
      setFormatError(SEARCH_COPY.notAScheduleId(trimmed));
      return;
    }
    setFormatError(null);
    setCommittedId(trimmed);
    onSelect(trimmed);
  };

  return (
    <div role="search" className="flex flex-col gap-2 border-b border-base-300 pb-4">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor={inputId} className="m-0 text-xs font-semibold text-base-content/60">
          {SEARCH_COPY.label}
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            value={term}
            onChange={event => setTerm(event.target.value)}
            placeholder="0.0.12345"
            className="input input-bordered input-sm flex-1"
          />
          <button type="submit" className="btn btn-sm">
            {SEARCH_COPY.button}
          </button>
        </div>
        {formatError && (
          <p role="alert" className="m-0 text-sm text-error">
            {formatError}
          </p>
        )}
      </form>
      {committedId && !knownScheduleIds.has(committedId) && (
        <ScheduleSearchResult
          scheduleId={committedId}
          governanceAccountId={governanceAccountId}
          executorContractId={executorContractId}
          network={network}
          selected={selectedScheduleId === committedId}
          onToggle={() => onToggle(committedId)}
          detail={selectedDetail}
        />
      )}
    </div>
  );
};

type ScheduleSearchResultProps = {
  scheduleId: string;
  governanceAccountId: string;
  executorContractId: string;
  network: HederaNetworkName;
  selected: boolean;
  onToggle: () => void;
  detail: ReactNode;
};

/**
 * Only mounted once a syntactically valid id has been committed, so nothing shows for an empty field
 * or a keystroke. `useProposalLookup` also reads nothing for a malformed id, so one that reached it
 * anyway would say "not found" rather than repeat Mirror's error.
 */
const ScheduleSearchResult = ({ scheduleId, selected, onToggle, detail, ...options }: ScheduleSearchResultProps) => {
  const { proposal, isLoading, error } = useProposalLookup({ ...options, scheduleId });

  if (isLoading) {
    return <span className="loading loading-spinner loading-sm" aria-label={SEARCH_COPY.lookingUp(scheduleId)} />;
  }
  if (error) {
    return (
      <p role="alert" className="m-0 text-sm text-error">
        {error.message}
      </p>
    );
  }
  if (!proposal) {
    return <p className="m-0 text-sm text-base-content/60">{SEARCH_COPY.notFound(scheduleId)}</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      <OperationCard proposal={proposal} selected={selected} onSelect={onToggle} detail={detail} />
    </ul>
  );
};
