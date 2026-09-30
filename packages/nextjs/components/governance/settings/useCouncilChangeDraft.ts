import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type CouncilChange,
  changeFrom,
  draftCouncilChange,
  offeredSeatsOf,
  reoffer,
  stepThreshold,
  toggleSeat,
} from "./councilChange";
import { memberKeysOf } from "./memberAccounts";
import type { UnseatedAgent } from "./useUnseatedAgent";
import { useProposalWizard } from "~~/components/governance/wizard/ProposalWizardProvider";
import type { GovernanceConfig } from "~~/config/governanceConfig";
import { useAccounts } from "~~/hooks/mirror/useAccounts";
import type { CouncilQueryData } from "~~/hooks/mirror/useCouncil";
import { type DraftResult } from "~~/services/governance/drafts";

const NO_DRAFT: DraftResult = { status: "empty" };

/** An account row keeps its id while the rows around it are added and removed. */
export type MemberRow = { id: number; input: string };

const sameSeats = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((key, index) => key === b[index]);

export type CouncilChangeDraftParams = {
  council: CouncilQueryData;
  config: Pick<GovernanceConfig, "governanceAccountId" | "network">;
  unseatedAgent: UnseatedAgent | null;
};

/**
 * The council being composed: the seats ticked and the threshold, the rows that add accounts holding no
 * seat yet (read from the Mirror Node), and the rotation draft they make, which goes into the governance
 * layout's one draft and is emptied again when the composer leaves.
 */
export function useCouncilChangeDraft({ council, config, unseatedAgent }: CouncilChangeDraftParams) {
  const [change, setChange] = useState<CouncilChange>(() => changeFrom(council.key));
  const councilOffered = useMemo(() => offeredSeatsOf(council.key, unseatedAgent), [council.key, unseatedAgent]);

  const nextRowId = useRef(0);
  const [rows, setRows] = useState<MemberRow[]>([]);
  const memberInputs = useMemo(() => rows.map(row => row.input.trim()), [rows]);
  const reads = useAccounts(memberInputs, { network: config.network });
  const members = useMemo(
    () => memberKeysOf(memberInputs, reads, councilOffered),
    [memberInputs, reads, councilOffered],
  );
  const offered = useMemo(() => [...councilOffered, ...members.memberKeys], [councilOffered, members.memberKeys]);

  // A seat an added row resolves to comes in ticked; one whose row is removed or edited goes. It is
  // derived while rendering, from the seats of the previous render, so no frame shows the seat unticked.
  const [added, setAdded] = useState<string[]>([]);
  if (!sameSeats(added, members.memberKeys)) {
    const joining = members.memberKeys.filter(key => !added.includes(key));
    setAdded(members.memberKeys);
    setChange(current => reoffer(current, offered, joining));
  }

  // Until every row is an account with a seat, or says it adds nothing, the change is held back.
  const result = useMemo(
    () => (members.settled ? draftCouncilChange(config.governanceAccountId, change, council.key) : NO_DRAFT),
    [members.settled, config.governanceAccountId, change, council.key],
  );
  const { setDraft } = useProposalWizard();
  useEffect(() => {
    setDraft(result);
  }, [result, setDraft]);
  useEffect(
    () => () => {
      setDraft(NO_DRAFT);
    },
    [setDraft],
  );

  const toggle = useCallback((seat: string) => setChange(current => toggleSeat(current, seat, offered)), [offered]);
  const step = useCallback((by: 1 | -1) => setChange(current => stepThreshold(current, by)), []);
  const updateRow = useCallback(
    (id: number, input: string) => setRows(current => current.map(row => (row.id === id ? { ...row, input } : row))),
    [],
  );
  const removeRow = useCallback((id: number) => setRows(current => current.filter(row => row.id !== id)), []);
  const addRow = useCallback(() => {
    const id = nextRowId.current;
    nextRowId.current += 1;
    setRows(current => [...current, { id, input: "" }]);
  }, []);

  return { change, offered, rows, reads, members, result, toggle, step, addRow, updateRow, removeRow };
}
