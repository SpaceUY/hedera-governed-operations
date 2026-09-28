"use client";

import { useEffect, useState } from "react";
import { type DraftResult, draftTreasuryTransfer, tryDraft } from "../drafts";
import { HbarInput, HederaAddressInput } from "@scaffold-hbar-ui/components";
import type { Chain } from "viem";
import { useAccount } from "~~/hooks/mirror/useAccount";
import type { CouncilKey } from "~~/services/governance/council";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";
import { MirrorNodeError } from "~~/services/mirror";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

type TransferFormProps = {
  governanceAccountId: string;
  network: HederaNetworkName;
  chain: Chain;
  council: CouncilKey | undefined;
  onDraftChange: (result: DraftResult) => void;
};

export const TransferForm = ({ governanceAccountId, network, chain, council, onDraftChange }: TransferFormProps) => {
  const [recipientText, setRecipientText] = useState("");
  const [amount, setAmount] = useState("");
  const recipient = useAccount(recipientText, { network });
  const recipientAccountId = recipient.data?.account;

  useEffect(() => {
    if (!recipientText.trim() || !amount.trim()) return onDraftChange({ status: "empty" });
    if (recipient.error) {
      const notFound = recipient.error instanceof MirrorNodeError && recipient.error.status === 404;
      const message = notFound
        ? `No account found for ${recipientText.trim()}`
        : `Could not look up ${recipientText.trim()} right now. Try again.`;
      return onDraftChange({ status: "invalid", message });
    }
    if (!recipientAccountId) return onDraftChange({ status: "empty" });
    onDraftChange(tryDraft(() => draftTreasuryTransfer(governanceAccountId, { recipientAccountId, amount })));
  }, [recipientText, recipientAccountId, recipient.error, amount, governanceAccountId, onDraftChange]);

  return (
    <div className="rounded-box border border-base-300 bg-base-200 p-4 flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">Recipient account</span>
        <HederaAddressInput
          value={recipientText}
          onChange={setRecipientText}
          placeholder="0.0.x or 0x…"
          chainId={chain.id}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">Amount (ℏ)</span>
        <HbarInput chain={chain} onValueChange={({ valueInNative }) => setAmount(valueInNative)} />
      </label>
      <p className="m-0 text-[13px] text-base-content/60 leading-normal">
        A native scheduled transfer. It touches no contract: no registry entry, no event — just the same
        {council ? ` ${councilRuleLabel(council)}` : ""} threshold on the treasury.
      </p>
    </div>
  );
};
