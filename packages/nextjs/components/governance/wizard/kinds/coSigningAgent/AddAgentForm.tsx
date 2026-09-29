"use client";

import { useEffect, useMemo, useState } from "react";
import { agentSeatOf, draftAgentSeat } from "./agentSeat";
import { CO_SIGNING_AGENT_COPY, type SeatName } from "./copy";
import { HederaAddressInput } from "@scaffold-hbar-ui/components";
import type { CouncilKey } from "@sh/core/governance/council";
import { MAP_LABELS } from "~~/components/governance/graph/copy";
import { type MemberName, memberNamesOf } from "~~/components/governance/graph/mapModel";
import { useComposedMap } from "~~/components/governance/graph/useComposedMap";
import { ACCOUNT_LOOKUP_LABELS } from "~~/components/governance/wizard/copy";
import type { KindFormProps } from "~~/components/governance/wizard/kinds/wizardKind";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { useAccount } from "~~/hooks/mirror/useAccount";

export type CoSigningAgentTargets = {
  /** The deployment the map beside the rail composes, so the members are named as the map names them. */
  config: GovernanceConfig;
  /** The account the form starts with, when the configuration names the agent's; empty otherwise. */
  suggestedAgentAccountId: string | null;
};

/** The council's seats in its own order, by their names on the map; the map calls the connected one "You". */
const seatNamesOf = (council: CouncilKey, names: Record<string, MemberName>): SeatName[] =>
  council.memberKeys.map(key => {
    const name = names[key]?.name ?? key;
    return { label: name, isViewer: name === MAP_LABELS.you };
  });

export const AddAgentForm = ({
  targets: { config, suggestedAgentAccountId },
  network,
  chain,
  council,
  onDraftChange,
}: KindFormProps<CoSigningAgentTargets>) => {
  const [agentText, setAgentText] = useState(suggestedAgentAccountId ?? "");
  const agentInput = agentText.trim();
  const agent = useAccount(agentInput, { network });
  const { composed } = useComposedMap(config);
  const memberNames = useMemo(() => composed && memberNamesOf(composed), [composed]);
  const { governanceAccountId } = config;

  useEffect(() => {
    if (!council) {
      onDraftChange({ status: "empty" });
      return;
    }
    const seat = agentSeatOf(agentInput, { account: agent.data, error: agent.error }, council);
    if (seat.status !== "found") {
      onDraftChange(seat);
      return;
    }
    onDraftChange(draftAgentSeat(governanceAccountId, council, seat.key));
  }, [agentInput, agent.data, agent.error, council, governanceAccountId, onDraftChange]);

  const newKey = council && memberNames && CO_SIGNING_AGENT_COPY.newKey(council, seatNamesOf(council, memberNames));

  return (
    <div className="rounded-box border border-base-300 bg-base-200 p-4 flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">{CO_SIGNING_AGENT_COPY.accountLabel}</span>
        <HederaAddressInput value={agentText} onChange={setAgentText} placeholder="0.0.x or 0x…" chainId={chain.id} />
        {agent.isLoading && (
          <span role="status" className="text-sm text-base-content/60">
            {ACCOUNT_LOOKUP_LABELS.loading(agentInput)}
          </span>
        )}
      </label>
      {newKey && (
        <p className="m-0 text-sm text-base-content/60 leading-normal">
          {newKey.lead}
          <strong className="font-semibold text-base-content">{newKey.rule}</strong>
          {newKey.rest}
        </p>
      )}
      {council && (
        <p role="note" className="m-0 text-sm leading-normal">
          {CO_SIGNING_AGENT_COPY.bothCouncils(council)}
        </p>
      )}
      <p className="m-0 text-sm text-base-content/60 leading-normal">{CO_SIGNING_AGENT_COPY.agentNeverSigns}</p>
    </div>
  );
};
