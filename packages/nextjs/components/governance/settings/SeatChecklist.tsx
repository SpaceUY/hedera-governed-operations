import { SETTINGS_COPY } from "./copy";
import { type CouncilChange, seatTagOf } from "./councilChange";
import type { MemberKeys } from "./memberAccounts";
import type { CouncilKey } from "@sh/core/governance/council";
import { monogramOf } from "~~/components/governance/graph/geometry";
import { SeatAvatar } from "~~/components/governance/rail/SeatAvatar";
import { MEMBER_COPY } from "~~/components/governance/rail/copy";
import { type SeatNaming, councilSeatOf } from "~~/components/governance/rail/councilSeats";

const TAG_CLASSES = { joins: "text-success-ink", leaves: "text-error" } as const;

export type SeatChecklistProps = {
  offered: readonly string[];
  change: CouncilChange;
  council: CouncilKey;
  naming: SeatNaming;
  /** The rows that add accounts: an account found is named by its id. */
  members: MemberKeys;
  onToggle: (seat: string) => void;
};

/** Every seat the change may hold, ticked when it keeps it, tagged when the change adds or drops it. */
export const SeatChecklist = ({ offered, change, council, naming, members, onToggle }: SeatChecklistProps) => {
  const addedNames = Object.fromEntries(
    members.rows.flatMap(row => (row.status === "found" ? [[row.seat, { name: row.accountId }]] : [])),
  );
  const seatNaming: SeatNaming = { ...naming, memberNames: { ...naming.memberNames, ...addedNames } };

  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
      {offered.map(seatKey => {
        const seat = councilSeatOf(seatKey, seatNaming);
        const tag = seatTagOf(seatKey, change, council);
        const seated = council.memberKeys.includes(seatKey);
        return (
          <li key={seatKey}>
            <label className="flex cursor-pointer items-center gap-2 rounded-box border border-base-300 px-3 py-2 text-sm font-semibold has-checked:border-primary has-focus-visible:outline-2 has-focus-visible:outline-primary">
              <input
                type="checkbox"
                className="checkbox checkbox-primary checkbox-sm"
                checked={change.memberKeys.includes(seatKey)}
                onChange={() => onToggle(seatKey)}
              />
              <SeatAvatar
                label={seat.isViewer ? MEMBER_COPY.you : (seat.monogram ?? monogramOf(seat.name))}
                tone={seated ? "plain" : "ghost"}
              />
              <span className="min-w-0 flex-1">{seat.name}</span>
              {tag && <span className={`text-xs ${TAG_CLASSES[tag]}`}>{SETTINGS_COPY.composer.tags[tag]}</span>}
            </label>
          </li>
        );
      })}
    </ul>
  );
};
