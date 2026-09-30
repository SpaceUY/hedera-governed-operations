import { AGENT_COPY } from "./copy";

/**
 * The co-signing agent when its key is not one of the council's: a dashed seat that says so, and the
 * council it would make once seated. The last row of the council list, after the members.
 */
export const UnseatedAgentRow = ({ ruleWithAgent }: { ruleWithAgent: string }) => (
  <li className="flex items-center gap-3 border-t border-base-300 py-2 first:border-t-0">
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-base-content/30 text-xs font-semibold text-base-content/60"
    >
      {AGENT_COPY.monogram}
    </span>
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
        {AGENT_COPY.name}
        <span className="chip font-normal">{AGENT_COPY.notMember}</span>
      </span>
      <span className="text-xs text-base-content/60">{AGENT_COPY.notSeated}</span>
      <span className="text-xs text-base-content/60">{AGENT_COPY.howToSeat(ruleWithAgent)}</span>
    </span>
  </li>
);
