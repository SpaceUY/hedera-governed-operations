"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { COUNCIL_ROTATION_COPY } from "./copy";
import { memberKeysOf } from "./members";
import { HederaAddressInput } from "@scaffold-hbar-ui/components";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { ACCOUNT_LOOKUP_LABELS } from "~~/components/governance/wizard/copy";
import type { KindFormProps } from "~~/components/governance/wizard/kinds/wizardKind";
import { useAccounts } from "~~/hooks/mirror/useAccount";
import { type CouncilRotationTargets, draftCouncilRotation, tryDraft } from "~~/services/governance/drafts";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";

/** A member row keeps its id while the rows around it are added and removed. */
type MemberRow = { id: number; input: string };

export const CouncilRotationForm = ({
  targets: { governanceAccountId },
  network,
  chain,
  council,
  onDraftChange,
}: KindFormProps<CouncilRotationTargets>) => {
  const thresholdId = useId();
  const nextRowId = useRef(1);
  const [rows, setRows] = useState<MemberRow[]>([{ id: 0, input: "" }]);
  const [chosenThreshold, setChosenThreshold] = useState<number | null>(null);

  const memberInputs = useMemo(() => rows.map(row => row.input.trim()), [rows]);
  const reads = useAccounts(memberInputs, { network });
  const seats = rows.length;
  // Starts at the current council's threshold, and never asks for more signatures than there are seats.
  const threshold = Math.min(chosenThreshold ?? council?.threshold ?? 1, seats);

  useEffect(() => {
    const members = memberKeysOf(memberInputs, reads);
    if (members.status !== "found") {
      onDraftChange(members);
      return;
    }
    onDraftChange(
      tryDraft(() => draftCouncilRotation({ governanceAccountId }, { memberKeys: members.memberKeys, threshold })),
    );
  }, [memberInputs, reads, threshold, governanceAccountId, onDraftChange]);

  const updateRow = (id: number, input: string) =>
    setRows(current => current.map(row => (row.id === id ? { ...row, input } : row)));
  const removeRow = (id: number) => setRows(current => current.filter(row => row.id !== id));
  const addRow = () => {
    const id = nextRowId.current;
    nextRowId.current += 1;
    setRows(current => [...current, { id, input: "" }]);
  };

  const currentRule = council ? councilRuleLabel(council) : null;
  // One seat per row: the rule reads the same whether the rows are keys yet or still being looked up.
  const proposedRule = councilRuleLabel({ threshold, memberKeys: memberInputs });

  return (
    <div className="rounded-box border border-base-300 bg-base-200 p-4 flex flex-col gap-3">
      {currentRule && <p className="m-0 text-sm font-semibold">{COUNCIL_ROTATION_COPY.currentCouncil(currentRule)}</p>}
      <p className="m-0 text-sm text-base-content/60 leading-normal">{COUNCIL_ROTATION_COPY.replacesWholeKey}</p>

      <ol className="m-0 p-0 list-none flex flex-col gap-2">
        {rows.map((row, index) => (
          <li key={row.id} className="flex flex-col gap-1">
            <div className="flex items-end gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-sm font-semibold">{COUNCIL_ROTATION_COPY.memberLabel(index + 1)}</span>
                <HederaAddressInput
                  value={row.input}
                  onChange={input => updateRow(row.id, input)}
                  placeholder="0.0.x or 0x…"
                  chainId={chain.id}
                />
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-square"
                aria-label={COUNCIL_ROTATION_COPY.removeMember(index + 1)}
                disabled={rows.length === 1}
                onClick={() => removeRow(row.id)}
              >
                <XMarkIcon className="size-4" />
              </button>
            </div>
            {reads[index]?.isLoading && (
              <span role="status" className="text-sm text-base-content/60">
                {ACCOUNT_LOOKUP_LABELS.loading(memberInputs[index])}
              </span>
            )}
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-outline btn-sm self-start" onClick={addRow}>
        {COUNCIL_ROTATION_COPY.addMember}
      </button>

      <div className="flex items-center gap-2">
        <label htmlFor={thresholdId} className="text-sm font-semibold">
          {COUNCIL_ROTATION_COPY.thresholdLabel}
        </label>
        <select
          id={thresholdId}
          className="select select-sm w-auto"
          value={threshold}
          onChange={event => setChosenThreshold(Number(event.target.value))}
        >
          {Array.from({ length: seats }, (_, index) => index + 1).map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <span className="text-sm">{COUNCIL_ROTATION_COPY.thresholdOf(seats)}</span>
      </div>

      <p role="note" className="m-0 text-sm leading-normal">
        {COUNCIL_ROTATION_COPY.bothCouncils(currentRule, proposedRule)}
      </p>
      <p className="m-0 text-sm text-base-content/60 leading-normal">{COUNCIL_ROTATION_COPY.agentNeverSigns}</p>
    </div>
  );
};
