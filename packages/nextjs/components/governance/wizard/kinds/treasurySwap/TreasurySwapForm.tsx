"use client";

import { useEffect, useState } from "react";
import { TREASURY_SWAP_COPY } from "./copy";
import { HbarInput } from "@scaffold-hbar-ui/components";
import { useDebounceValue } from "usehooks-ts";
import { formatUnits } from "viem";
import { tokenUnreadableLabel } from "~~/components/governance/wizard/copy";
import type { KindFormProps } from "~~/components/governance/wizard/kinds/wizardKind";
import { useToken } from "~~/hooks/mirror/useToken";
import { useTreasurySwapQuote } from "~~/hooks/useTreasurySwapQuote";
import { type TreasurySwapTargets, draftTreasurySwap, tryDraft } from "~~/services/governance/drafts";
import { DEFAULT_SLIPPAGE_BPS, type SwapQuote } from "~~/services/swap";
import { HBAR_DECIMALS, parseAmount } from "~~/utils/scaffold-hbar/hbarAmount";

/** Long enough that typing an amount asks the quoter once, not once per keystroke. */
const QUOTE_DEBOUNCE_MS = 400;

/** An amount as typed, or null while it is not one yet; the draft reports why, this only feeds the quote. */
function amountOrNull(text: string, decimals: number): bigint | null {
  try {
    return parseAmount(text, decimals);
  } catch {
    return null;
  }
}

export const TreasurySwapForm = ({
  targets: { adapter, adapterContractId, governanceAccountId, tokenOutId, fee },
  network,
  chain,
  onDraftChange,
}: KindFormProps<TreasurySwapTargets>) => {
  const [amount, setAmount] = useState("");
  const [floor, setFloor] = useState("");
  const [quotedAmount] = useDebounceValue(amount, QUOTE_DEBOUNCE_MS);

  const token = useToken(tokenOutId, { network });
  const decimals = token.data?.decimals;
  const symbol = token.data?.token.symbol ?? tokenOutId;
  const quote = useTreasurySwapQuote({
    network,
    tokenOutId,
    amountInTinybars: amountOrNull(quotedAmount, HBAR_DECIMALS),
  });

  useEffect(() => {
    if (!amount.trim() || !floor.trim()) {
      onDraftChange({ status: "empty" });
      return;
    }
    if (token.error) {
      onDraftChange({ status: "invalid", message: tokenUnreadableLabel(tokenOutId) });
      return;
    }
    // The floor is in the token's own units, so nothing is drafted until its decimals are known.
    if (decimals === undefined) {
      onDraftChange({ status: "empty" });
      return;
    }
    onDraftChange(
      tryDraft(() =>
        draftTreasurySwap(
          { adapter, adapterContractId, governanceAccountId, tokenOutId, fee },
          { amount, floor, tokenOutDecimals: decimals },
        ),
      ),
    );
  }, [
    amount,
    floor,
    decimals,
    token.error,
    adapter,
    adapterContractId,
    governanceAccountId,
    tokenOutId,
    fee,
    onDraftChange,
  ]);

  const floorUnits = decimals === undefined ? null : amountOrNull(floor, decimals);
  const floorAboveQuote = quote.data !== undefined && floorUnits !== null && floorUnits > quote.data.amountOut;

  return (
    <div className="rounded-box border border-base-300 bg-base-200 p-4 flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">HBAR to sell (ℏ)</span>
        <HbarInput chain={chain} onValueChange={({ valueInNative }) => setAmount(valueInNative)} />
      </label>

      {quote.isLoading && (
        <p role="status" className="m-0 text-sm text-base-content/60">
          {TREASURY_SWAP_COPY.quoteLoading}
        </p>
      )}
      {quote.isError && <p className="m-0 text-sm text-warning">{TREASURY_SWAP_COPY.quoteUnavailable}</p>}
      {quote.data && decimals !== undefined && (
        <QuoteLine quote={quote.data} decimals={decimals} symbol={symbol} onUseQuote={setFloor} />
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Floor: the least it may yield ({symbol})</span>
        <input
          className="input w-full"
          inputMode="decimal"
          placeholder="0.0"
          value={floor}
          onChange={event => setFloor(event.target.value)}
        />
      </label>
      {floorAboveQuote && (
        <p role="status" className="m-0 text-sm text-warning">
          {TREASURY_SWAP_COPY.floorAboveQuote}
        </p>
      )}

      <p className="m-0 text-sm text-base-content/60 leading-normal">{TREASURY_SWAP_COPY.explainer}</p>
    </div>
  );
};

type QuoteLineProps = { quote: SwapQuote; decimals: number; symbol: string; onUseQuote: (floor: string) => void };

/** Today's price, and a floor derived from it the proposer can take or overwrite. */
const QuoteLine = ({ quote, decimals, symbol, onUseQuote }: QuoteLineProps) => (
  <div className="flex flex-wrap items-center gap-2">
    <p className="m-0 text-sm">{TREASURY_SWAP_COPY.quote(formatUnits(quote.amountOut, decimals), symbol)}</p>
    <button
      type="button"
      className="btn btn-ghost btn-xs"
      onClick={() => onUseQuote(formatUnits(quote.amountOutMinimum, decimals))}
    >
      {TREASURY_SWAP_COPY.useQuote(DEFAULT_SLIPPAGE_BPS)}
    </button>
  </div>
);
