"use client";

import { useEffect, useState } from "react";
import { HbarInput, HederaAddressInput } from "@scaffold-hbar-ui/components";
import type { CouncilKey } from "@sh/core/governance/council";
import { MirrorNodeError, isMirrorEntityRef } from "@sh/core/mirror";
import type { Chain } from "viem";
import { RECIPIENT_LOOKUP_LABELS } from "~~/components/governance/wizard/copy";
import { useAccount } from "~~/hooks/mirror/useAccount";
import { type DraftResult, draftTreasuryTransfer, tryDraft } from "~~/services/governance/drafts";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";
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
  const recipientInput = recipientText.trim();
  const recipient = useAccount(recipientInput, { network });
  const recipientAccountId = recipient.data?.account;

  useEffect(() => {
    if (!recipientInput || !amount.trim()) {
      onDraftChange({ status: "empty" });
      return;
    }
    // `useAccount` stays idle on an input it cannot look up, so a malformed one would otherwise wait forever.
    if (!isMirrorEntityRef(recipientInput)) {
      onDraftChange({ status: "invalid", message: RECIPIENT_LOOKUP_LABELS.malformed(recipientInput) });
      return;
    }
    if (recipient.error) {
      const notFound = recipient.error instanceof MirrorNodeError && recipient.error.status === 404;
      const label = notFound ? RECIPIENT_LOOKUP_LABELS.notFound : RECIPIENT_LOOKUP_LABELS.unreachable;
      onDraftChange({ status: "invalid", message: label(recipientInput) });
      return;
    }
    if (!recipientAccountId) {
      onDraftChange({ status: "empty" });
      return;
    }
    onDraftChange(tryDraft(() => draftTreasuryTransfer(governanceAccountId, { recipientAccountId, amount })));
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
            {RECIPIENT_LOOKUP_LABELS.loading(recipientInput)}
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
