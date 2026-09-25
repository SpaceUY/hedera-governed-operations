"use client";

import { useEffect, useState } from "react";
import { type DraftResult, draftTreasuryTransfer, tryDraft } from "../drafts";
import { HbarInput, HederaAddressInput } from "@scaffold-hbar-ui/components";
import { useAccount } from "~~/hooks/mirror/useAccount";
import type { CouncilKey } from "~~/services/governance/council";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";

type TransferFormProps = {
  governanceAccountId: string;
  council: CouncilKey | undefined;
  onDraftChange: (result: DraftResult) => void;
};

export const TransferForm = ({ governanceAccountId, council, onDraftChange }: TransferFormProps) => {
  const [recipientText, setRecipientText] = useState("");
  const [amount, setAmount] = useState("");
  const recipient = useAccount(recipientText);
  const recipientAccountId = recipient.data?.account;

  useEffect(() => {
    if (!recipientText.trim() || !amount.trim()) return onDraftChange({ status: "empty" });
    if (recipient.isError) {
      return onDraftChange({ status: "invalid", message: `No account found for ${recipientText.trim()}` });
    }
    if (!recipientAccountId) return onDraftChange({ status: "empty" });
    onDraftChange(tryDraft(() => draftTreasuryTransfer(governanceAccountId, { recipientAccountId, amount })));
  }, [recipientText, recipientAccountId, recipient.isError, amount, governanceAccountId, onDraftChange]);

  return (
    <div className="rounded-box border border-base-300 bg-base-200 p-4 flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">Recipient account</span>
        <HederaAddressInput value={recipientText} onChange={setRecipientText} placeholder="0.0.x or 0x…" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">Amount (ℏ)</span>
        <HbarInput onValueChange={({ valueInNative }) => setAmount(valueInNative)} />
      </label>
      <p className="m-0 text-[13px] text-base-content/60 leading-normal">
        A native scheduled transfer. It touches no contract: no registry entry, no event — just the same
        {council ? ` ${councilRuleLabel(council)}` : ""} threshold on the treasury.
      </p>
    </div>
  );
};
