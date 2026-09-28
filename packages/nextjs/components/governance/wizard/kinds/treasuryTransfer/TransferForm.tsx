"use client";

import { useEffect, useState } from "react";
import { HbarInput, HederaAddressInput } from "@scaffold-hbar-ui/components";
import { ACCOUNT_LOOKUP_LABELS } from "~~/components/governance/wizard/copy";
import { accountLookup } from "~~/components/governance/wizard/kinds/accountLookup";
import type { KindFormProps } from "~~/components/governance/wizard/kinds/wizardKind";
import { useAccount } from "~~/hooks/mirror/useAccount";
import { type TreasuryTransferTargets, draftTreasuryTransfer, tryDraft } from "~~/services/governance/drafts";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";

export const TransferForm = ({
  targets: { governanceAccountId },
  network,
  chain,
  council,
  onDraftChange,
}: KindFormProps<TreasuryTransferTargets>) => {
  const [recipientText, setRecipientText] = useState("");
  const [amount, setAmount] = useState("");
  const recipientInput = recipientText.trim();
  const recipient = useAccount(recipientInput, { network });
  const recipientAccountId = recipient.data?.account;

  useEffect(() => {
    if (!amount.trim()) {
      onDraftChange({ status: "empty" });
      return;
    }
    const lookup = accountLookup(recipientInput, { accountId: recipientAccountId, error: recipient.error });
    if (lookup.status !== "found") {
      onDraftChange(lookup);
      return;
    }
    onDraftChange(
      tryDraft(() => draftTreasuryTransfer(governanceAccountId, { recipientAccountId: lookup.accountId, amount })),
    );
  }, [recipientInput, recipientAccountId, recipient.error, amount, governanceAccountId, onDraftChange]);

  return (
    <div className="rounded-box border border-base-300 bg-base-200 p-4 flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Recipient account</span>
        <HederaAddressInput
          value={recipientText}
          onChange={setRecipientText}
          placeholder="0.0.x or 0x…"
          chainId={chain.id}
        />
        {recipient.isLoading && (
          <span role="status" className="text-sm text-base-content/60">
            {ACCOUNT_LOOKUP_LABELS.loading(recipientInput)}
          </span>
        )}
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Amount (ℏ)</span>
        <HbarInput chain={chain} onValueChange={({ valueInNative }) => setAmount(valueInNative)} />
      </label>
      <p className="m-0 text-sm text-base-content/60 leading-normal">
        A native scheduled transfer. It touches no contract: no registry entry, no event — just the same
        {council ? ` ${councilRuleLabel(council)}` : ""} threshold on the treasury.
      </p>
    </div>
  );
};
