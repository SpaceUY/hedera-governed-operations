import { SETTINGS_COPY } from "./copy";
import type { MemberKeys, MemberSeat } from "./memberAccounts";
import type { MemberRow } from "./useCouncilChangeDraft";
import { HederaAddressInput } from "@scaffold-hbar-ui/components";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { ACCOUNT_LOOKUP_LABELS } from "~~/components/governance/wizard/copy";
import type { AccountListRead } from "~~/hooks/mirror/useAccounts";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";

/** What a row says under itself: still looking, empty, or why it adds no seat. */
function rowStatusText(position: number, input: string, row: MemberSeat, read: AccountListRead | undefined) {
  if (input === "") return SETTINGS_COPY.composer.members.emptyMember(position);
  if (read?.isLoading) return ACCOUNT_LOOKUP_LABELS.loading(input);
  if (row.status === "invalid" || row.status === "offered") return row.message;
  return null;
}

export type MemberRowsProps = {
  rows: readonly MemberRow[];
  members: MemberKeys;
  reads: readonly AccountListRead[];
  onChange: (id: number, input: string) => void;
  onRemove: (id: number) => void;
};

/** The accounts a change adds, one address input per row, each saying what its account resolved to. */
export const MemberRows = ({ rows, members, reads, onChange, onRemove }: MemberRowsProps) => {
  const { targetNetwork } = useTargetNetwork();
  if (rows.length === 0) return null;

  return (
    <ol aria-label={SETTINGS_COPY.composer.members.legend} className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map((row, index) => {
        const status = rowStatusText(index + 1, row.input.trim(), members.rows[index], reads[index]);
        return (
          <li key={row.id} className="flex flex-col gap-1">
            <div className="flex items-end gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-sm font-semibold">{SETTINGS_COPY.composer.members.memberLabel(index + 1)}</span>
                <HederaAddressInput
                  value={row.input}
                  onChange={input => onChange(row.id, input)}
                  placeholder="0.0.x or 0x…"
                  chainId={targetNetwork.id}
                />
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-square"
                aria-label={SETTINGS_COPY.composer.members.removeMember(index + 1)}
                onClick={() => onRemove(row.id)}
              >
                <XMarkIcon className="size-4" />
              </button>
            </div>
            {status && (
              <span role="status" className="text-sm text-base-content/60">
                {status}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
};
