import { useId } from "react";
import { SETTINGS_COPY } from "./copy";
import type { UnseatedAgent } from "./useUnseatedAgent";
import type { CouncilKey } from "@sh/core/governance/council";
import { CouncilMemberRow } from "~~/components/governance/rail/CouncilMemberRow";
import { UnseatedAgentRow } from "~~/components/governance/rail/UnseatedAgentRow";
import { type SeatNaming, councilSeatOf, withSeat } from "~~/components/governance/rail/councilSeats";
import type { CouncilQueryData } from "~~/hooks/mirror/useCouncil";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";

export type CouncilCardProps = {
  council: CouncilQueryData | undefined;
  unreadable: boolean;
  naming: SeatNaming;
  unseatedAgent: UnseatedAgent | null;
};

/** What the agent's dashed row says: the council ticking it would propose, or why it cannot be seated. */
function agentNotes({ seat, check }: UnseatedAgent, council: CouncilKey): string[] {
  if (check.status === "found")
    return [SETTINGS_COPY.council.agentNotSeated(councilRuleLabel(withSeat(council, seat)))];
  if (check.status === "invalid") return [check.message];
  return [];
}

/**
 * Who approves, as the ledger has it: the treasury account's threshold key, read from the Mirror Node.
 * One row per seat, named as the map names it; the co-signing agent's seat is named as the agent, and
 * an agent the council does not seat gets a dashed row pointing at the composer below, or saying why it
 * cannot be seated.
 */
export const CouncilCard = (props: CouncilCardProps) => {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-box border border-base-300 p-4">
      <h2 id={headingId} className="m-0 text-xs font-semibold text-base-content/70">
        {SETTINGS_COPY.council.heading}
      </h2>
      <CouncilBody {...props} />
    </section>
  );
};

const CouncilBody = ({ council, unreadable, naming, unseatedAgent }: CouncilCardProps) => {
  if (unreadable && !council)
    return (
      <p role="status" className="m-0 text-sm text-warning-ink">
        {SETTINGS_COPY.council.unreadable}
      </p>
    );
  if (!council)
    return <div role="status" aria-label={SETTINGS_COPY.council.loading} className="skeleton h-24 rounded-box" />;
  return (
    <>
      <p className="m-0 flex flex-wrap items-baseline gap-x-2">
        <span className="text-3xl font-bold tabular-nums">{councilRuleLabel(council.key)}</span>
        <span className="text-sm text-base-content/70">{SETTINGS_COPY.council.ruleSuffix}</span>
      </p>
      <p className="m-0 text-sm text-base-content/70">{SETTINGS_COPY.council.note}</p>
      <ul className="m-0 flex list-none flex-col p-0">
        {council.key.memberKeys.map(key => (
          <CouncilMemberRow key={key} {...councilSeatOf(key, naming)} />
        ))}
        {unseatedAgent && <UnseatedAgentRow notes={agentNotes(unseatedAgent, council.key)} />}
      </ul>
    </>
  );
};
