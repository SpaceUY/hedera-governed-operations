import { SeatAvatar } from "./SeatAvatar";
import { AGENT_COPY } from "./copy";

/**
 * The co-signing agent when its key is not one of the council's: a dashed seat marked "not a member",
 * and what the screen hosting it says about seating it. The last row of a council list.
 */
export const UnseatedAgentRow = ({ notes }: { notes: readonly string[] }) => (
  <li className="flex items-center gap-3 border-t border-base-300 py-2 first:border-t-0">
    <SeatAvatar label={AGENT_COPY.monogram} tone="ghost" />
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
        {AGENT_COPY.name}
        <span className="chip font-normal">{AGENT_COPY.notMember}</span>
      </span>
      {notes.map(note => (
        <span key={note} className="text-xs text-base-content/60">
          {note}
        </span>
      ))}
    </span>
  </li>
);
