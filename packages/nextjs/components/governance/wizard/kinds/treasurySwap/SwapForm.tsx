"use client";

import { useEffect, useState } from "react";
import { SWAP_FORM_LABELS } from "./copy";
import { AccountId, TokenId } from "@hiero-ledger/sdk";
import { HbarInput } from "@scaffold-hbar-ui/components";
import { type Address, formatUnits } from "viem";
import type { KindFormProps } from "~~/components/governance/wizard/kinds/wizardKind";
import { useToken } from "~~/hooks/mirror/useToken";
import { useSwapQuote } from "~~/hooks/swap/useSwapQuote";
import { draftTreasurySwap, tryDraft } from "~~/services/governance/drafts";
import { SAUCERSWAP_V2_CONFIG } from "~~/services/swap";
import { HBAR_DECIMALS, parseAmount } from "~~/utils/scaffold-hbar/hbarAmount";

export type SwapFormTargets = {
  adapter: Address;
  /** How the preview names the adapter: its native id, or its address when the deploy recorded none. */
  adapterLabel: string;
  /** The treasury, which the DEX pays the output back to. */
  governanceAccountId: string;
};

/** A Hedera entity with no EVM alias is addressed by its number, which is what both of these have. */
const tokenAddress = (tokenId: string): Address => `0x${TokenId.fromString(tokenId).toEvmAddress()}`;
const accountAddress = (accountId: string): Address => `0x${AccountId.fromString(accountId).toEvmAddress()}`;

/** The amount as tinybars, or null while it is empty or not yet a number — the quote needs no error. */
const tinybarsOrNull = (text: string): bigint | null => {
  try {
    return parseAmount(text, HBAR_DECIMALS);
  } catch {
    return null;
  }
};

/**
 * Sells treasury HBAR for the DEX's stablecoin. The quote beside the floor is the pool's price now
 * and is shown as a reference only: the proposal is approved later and executes later still, so the
 * floor is the proposer's decision and the one thing the council is really voting on.
 */
export const SwapForm = ({
  targets: { adapter, adapterLabel, governanceAccountId },
  network,
  chain,
  onDraftChange,
}: KindFormProps<SwapFormTargets>) => {
  const [amountIn, setAmountIn] = useState("");
  const [floor, setFloor] = useState("");

  const dex = SAUCERSWAP_V2_CONFIG[network];
  const tokenOutId = dex.usdcToken;
  const token = useToken(tokenOutId, { network });
  const decimals = token.data?.decimals;
  const symbol = token.data?.token.symbol ?? tokenOutId;
  const quote = useSwapQuote({ network, tokenOutId, amountInTinybars: tinybarsOrNull(amountIn) });

  useEffect(() => {
    if (!amountIn.trim() || !floor.trim()) {
      onDraftChange({ status: "empty" });
      return;
    }
    if (token.isError) {
      onDraftChange({ status: "invalid", message: SWAP_FORM_LABELS.tokenUnreadable(tokenOutId) });
      return;
    }
    // The floor has no meaning until the token's scale is known, and assuming one would misstate it.
    if (decimals === undefined) {
      onDraftChange({ status: "empty" });
      return;
    }
    onDraftChange(
      tryDraft(() =>
        draftTreasurySwap(
          {
            adapter,
            adapterContractId: adapterLabel,
            tokenOut: tokenAddress(tokenOutId),
            recipient: accountAddress(governanceAccountId),
            fee: dex.defaultFee,
          },
          { amountIn, floor, floorDecimals: decimals },
        ),
      ),
    );
  }, [
    amountIn,
    floor,
    decimals,
    token.isError,
    tokenOutId,
    adapter,
    adapterLabel,
    governanceAccountId,
    dex.defaultFee,
    onDraftChange,
  ]);

  return (
    <div className="rounded-box border border-base-300 bg-base-200 p-4 flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">{SWAP_FORM_LABELS.amount}</span>
        <HbarInput chain={chain} onValueChange={({ valueInNative }) => setAmountIn(valueInNative)} />
      </label>

      <p role="status" className="m-0 text-sm text-base-content/60">
        {quote.isLoading && SWAP_FORM_LABELS.quoteLoading}
        {quote.data && SWAP_FORM_LABELS.quote(formatUnits(quote.data.amountOut, decimals ?? 0), symbol)}
        {quote.isError && SWAP_FORM_LABELS.quoteUnavailable}
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">{SWAP_FORM_LABELS.floor(symbol)}</span>
        <input
          className="input input-bordered w-full"
          inputMode="decimal"
          value={floor}
          onChange={event => setFloor(event.target.value)}
          placeholder="0.00"
        />
        <span className="text-sm text-base-content/60">{SWAP_FORM_LABELS.floorHint}</span>
      </label>

      <p className="m-0 text-sm text-base-content/60 leading-normal">{SWAP_FORM_LABELS.staleFloorNote}</p>
    </div>
  );
};
