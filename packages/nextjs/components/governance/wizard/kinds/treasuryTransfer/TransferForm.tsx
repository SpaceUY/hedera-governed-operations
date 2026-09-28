"use client";

import { useEffect, useState } from "react";
import { TREASURY_TRANSFER_COPY } from "./copy";
import { HbarInput, HederaAddressInput } from "@scaffold-hbar-ui/components";
import { ACCOUNT_LOOKUP_LABELS, tokenUnreadableLabel } from "~~/components/governance/wizard/copy";
import { accountLookup } from "~~/components/governance/wizard/kinds/accountLookup";
import type { KindFormProps } from "~~/components/governance/wizard/kinds/wizardKind";
import { useAccount } from "~~/hooks/mirror/useAccount";
import { useToken } from "~~/hooks/mirror/useToken";
import { useTokenRelationship } from "~~/hooks/mirror/useTokenRelationship";
import {
  type TransferAsset,
  type TreasuryTransferTargets,
  draftTreasuryTransfer,
  tryDraft,
} from "~~/services/governance/drafts";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

const HBAR_OPTION = "hbar";

export const TransferForm = ({
  targets: { governanceAccountId, tokenIds },
  network,
  chain,
  council,
  onDraftChange,
}: KindFormProps<TreasuryTransferTargets>) => {
  const [recipientText, setRecipientText] = useState("");
  const [assetOption, setAssetOption] = useState(HBAR_OPTION);
  const [amount, setAmount] = useState("");
  const recipientInput = recipientText.trim();
  const recipient = useAccount(recipientInput, { network });
  const recipientAccountId = recipient.data?.account;
  const autoAssociationSlots = recipient.data?.max_automatic_token_associations;

  const tokenId = assetOption === HBAR_OPTION ? null : assetOption;
  const token = useToken(tokenId, { network });
  const decimals = token.data?.decimals;
  const symbol = token.data?.token.symbol ?? tokenId ?? "ℏ";
  // A holder that never associated a token cannot receive it, unless an automatic association slot is free.
  const relationship = useTokenRelationship(recipientAccountId, tokenId, { network });
  const notAssociated = tokenId !== null && relationship.data === null;

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
    const draft = (asset: TransferAsset) =>
      tryDraft(() =>
        draftTreasuryTransfer(governanceAccountId, { recipientAccountId: lookup.accountId, amount, asset }),
      );
    if (!tokenId) {
      onDraftChange(draft({ kind: "hbar" }));
      return;
    }
    if (token.error) {
      onDraftChange({ status: "invalid", message: tokenUnreadableLabel(tokenId) });
      return;
    }
    if (relationship.error) {
      onDraftChange({ status: "invalid", message: TREASURY_TRANSFER_COPY.relationshipUnreadable(lookup.accountId) });
      return;
    }
    // Until the token's decimals and the recipient's standing are read, there is no amount to name.
    if (decimals === undefined || relationship.data === undefined) {
      onDraftChange({ status: "empty" });
      return;
    }
    if (relationship.data === null && autoAssociationSlots === 0) {
      onDraftChange({ status: "invalid", message: TREASURY_TRANSFER_COPY.notAssociated(lookup.accountId, symbol) });
      return;
    }
    onDraftChange(draft({ kind: "token", tokenId, decimals }));
  }, [
    recipientInput,
    recipientAccountId,
    recipient.error,
    autoAssociationSlots,
    amount,
    tokenId,
    decimals,
    symbol,
    token.error,
    relationship.data,
    relationship.error,
    governanceAccountId,
    onDraftChange,
  ]);

  const chooseAsset = (option: string) => {
    setAssetOption(option);
    setAmount("");
  };

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
        <span className="text-sm font-semibold">Asset</span>
        <select className="select w-full" value={assetOption} onChange={event => chooseAsset(event.target.value)}>
          <option value={HBAR_OPTION}>{TREASURY_TRANSFER_COPY.hbarOption}</option>
          {tokenIds.map(id => (
            <TokenOption key={id} tokenId={id} network={network} />
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">{TREASURY_TRANSFER_COPY.amountLabel(symbol)}</span>
        {tokenId ? (
          <input
            className="input w-full"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={event => setAmount(event.target.value)}
          />
        ) : (
          <HbarInput chain={chain} onValueChange={({ valueInNative }) => setAmount(valueInNative)} />
        )}
      </label>
      {recipientAccountId && notAssociated && autoAssociationSlots !== 0 && (
        <p className="m-0 text-sm text-base-content/60">
          {TREASURY_TRANSFER_COPY.associatesOnReceipt(recipientAccountId, symbol)}
        </p>
      )}
      <p className="m-0 text-sm text-base-content/60 leading-normal">
        A native scheduled transfer. It touches no contract: no registry entry, no event — just the same
        {council ? ` ${councilRuleLabel(council)}` : ""} threshold on the treasury.
      </p>
    </div>
  );
};

type TokenOptionProps = { tokenId: string; network: HederaNetworkName };

/** A token named by its symbol once the Mirror Node has it, by its id until then. */
const TokenOption = ({ tokenId, network }: TokenOptionProps) => {
  const token = useToken(tokenId, { network });
  const symbol = token.data?.token.symbol;
  return <option value={tokenId}>{symbol ? `${symbol} · ${tokenId}` : tokenId}</option>;
};
