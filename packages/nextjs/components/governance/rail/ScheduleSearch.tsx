"use client";

import { type FormEvent, useId, useState } from "react";
import { OperationCard } from "./OperationCard";
import { isValidEntityId } from "@sh/core/mirror";
import { useProposalLookup } from "~~/hooks/mirror/useProposalLookup";

type ScheduleSearchProps = {
  governanceAccountId: string;
  executorContractId: string;
  network: string;
  selectedScheduleId: string | null;
  onSelect: (scheduleId: string) => void;
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
 */
export const ScheduleSearch = (props: ScheduleSearchProps) => {
  const inputId = useId();
  const [term, setTerm] = useState("");
  const [committedId, setCommittedId] = useState<string | null>(null);
  const [formatError, setFormatError] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = term.trim();
    if (!isValidEntityId(trimmed)) {
      setCommittedId(null);
      setFormatError(`"${trimmed}" doesn't look like a schedule id (expected 0.0.x).`);
      return;
    }
    setFormatError(null);
    setCommittedId(trimmed);
    props.onSelect(trimmed);
  };

  return (
    <form onSubmit={submit} role="search" className="flex flex-col gap-2 border-b border-base-300 pb-4">
      <label htmlFor={inputId} className="m-0 text-xs font-semibold text-base-content/60">
        Find a proposal by schedule id
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
          Find
        </button>
      </div>
      {formatError && (
        <p role="alert" className="m-0 text-sm text-error">
          {formatError}
        </p>
      )}
      {committedId && !props.knownScheduleIds.has(committedId) && (
        <ScheduleSearchResult
          scheduleId={committedId}
          governanceAccountId={props.governanceAccountId}
          executorContractId={props.executorContractId}
          network={props.network}
          selected={props.selectedScheduleId === committedId}
          onSelect={() => props.onSelect(committedId)}
        />
      )}
    </form>
  );
};

type ScheduleSearchResultProps = {
  scheduleId: string;
  governanceAccountId: string;
  executorContractId: string;
  network: string;
  selected: boolean;
  onSelect: () => void;
};

/**
 * Only mounted once a syntactically valid id has been committed: `useProposalLookup` has no `enabled`
 * gate of its own (unlike `useSchedule`), so keeping it out of the tree until then is what stops a
 * request from firing on every keystroke or on an empty field.
 */
const ScheduleSearchResult = ({ scheduleId, selected, onSelect, ...options }: ScheduleSearchResultProps) => {
  const { proposal, isLoading, error } = useProposalLookup({ ...options, scheduleId });

  if (isLoading) {
    return <span className="loading loading-spinner loading-sm" aria-label={`Looking up ${scheduleId}`} />;
  }
  if (error) {
    return (
      <p role="alert" className="m-0 text-sm text-error">
        {error.message}
      </p>
    );
  }
  if (!proposal) {
    return <p className="m-0 text-sm text-base-content/60">No proposal found for {scheduleId}.</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      <OperationCard proposal={proposal} selected={selected} onSelect={onSelect} />
    </ul>
  );
};
