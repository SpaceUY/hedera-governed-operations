"use client";

import { useEffect, useState } from "react";
import { agentSeatOf, draftAgentSeat } from "./agentSeat";
import { CO_SIGNING_AGENT_COPY } from "./copy";
import { HederaAddressInput } from "@scaffold-hbar-ui/components";
import { useCouncilSeatNames } from "~~/components/governance/graph/useCouncilSeatNames";
import { ACCOUNT_LOOKUP_LABELS } from "~~/components/governance/wizard/copy";
import type { KindFormProps } from "~~/components/governance/wizard/kinds/wizardKind";
import { useAccount } from "~~/hooks/mirror/useAccount";

export type CoSigningAgentTargets = {
  governanceAccountId: string;
  /** Read with the governance account to name the members, the proposers being who the map can name. */
  executorContractId: string;
  /** The account the form starts with, when the configuration names the agent's; empty otherwise. */
  suggestedAgentAccountId: string | null;
};

export const AddAgentForm = ({
  targets: { governanceAccountId, executorContractId, suggestedAgentAccountId },
  network,
  chain,
  council,
  onDraftChange,
}: KindFormProps<CoSigningAgentTargets>) => {
  const [agentText, setAgentText] = useState(suggestedAgentAccountId ?? "");
  const agentInput = agentText.trim();
  const agent = useAccount(agentInput, { network });
  const seatNames = useCouncilSeatNames({ governanceAccountId, executorContractId, network });

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

  const newKey = council && seatNames && CO_SIGNING_AGENT_COPY.newKey(council, seatNames);

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
