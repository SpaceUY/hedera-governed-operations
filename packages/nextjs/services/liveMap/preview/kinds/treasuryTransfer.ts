import type { PreviewContext, PreviewKind } from "./previewKind";
import { formatUnits } from "viem";
import { formatTinybars } from "~~/utils/scaffold-hbar/hbarAmount";

const WORDS = { receives: "would receive", unnamedAmount: "would receive a payment" } as const;

type Movement = { accountId: string; amount: string | null };

/** A token amount in the token's own decimals, or null when the app has not read them: no guessed amount. */
function tokenAmount(tokenId: string, amount: bigint, { tokenOf }: PreviewContext): string | null {
  const token = tokenOf(tokenId);
  return token ? `${formatUnits(amount, token.decimals)} ${token.symbol}` : null;
}

/**
 * On every credited account: what it would receive. The debited side is the treasury, which says
 * nothing. A sketch names no recipient — that is the form's — and says only that one would be paid.
 */
export const TREASURY_TRANSFER_PREVIEW: PreviewKind<"treasuryTransfer"> = {
  labels: (operation, context) => {
    const credited: Movement[] = [
      ...operation.hbar
        .filter(({ tinybars }) => tinybars > 0n)
        .map(({ accountId, tinybars }) => ({ accountId, amount: formatTinybars(tinybars) })),
      ...operation.tokens
        .filter(({ amount }) => amount > 0n)
        .map(({ accountId, tokenId, amount }) => ({ accountId, amount: tokenAmount(tokenId, amount, context) })),
    ];
    const accounts = [...new Set(credited.map(({ accountId }) => accountId))];
    return accounts.map(ref => {
      const amounts = credited.flatMap(({ accountId, amount }) => (accountId === ref && amount ? [amount] : []));
      return { ref, text: amounts.length > 0 ? `${WORDS.receives} ${amounts.join(" and ")}` : WORDS.unnamedAmount };
    });
  },
  sketch: () => ({ refs: {}, words: [{ role: "recipient", text: WORDS.unnamedAmount }] }),
};
