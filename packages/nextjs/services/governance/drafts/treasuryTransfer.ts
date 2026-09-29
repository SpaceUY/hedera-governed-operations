import type { ProposalDraft } from "./draft";
import { buildTreasuryTransfer } from "@sh/core/governance/encode";
import { HBAR_DECIMALS, parseAmount } from "~~/utils/scaffold-hbar/hbarAmount";

/**
 * The treasury is the only account a treasury transfer debits, and it pays for the schedule. `tokenIds`
 * are the HTS tokens the form offers besides HBAR.
 */
export type TreasuryTransferTargets = { governanceAccountId: string; tokenIds: string[] };

/** What a transfer moves: HBAR, or an HTS token whose decimals were read from the Mirror Node. */
export type TransferAsset = { kind: "hbar" } | { kind: "token"; tokenId: string; decimals: number };

export const HBAR_ASSET: TransferAsset = { kind: "hbar" };

/** `amount` is as typed, in the asset's whole units; HBAR when no asset is named. */
export type TreasuryTransferValues = { recipientAccountId: string; amount: string; asset?: TransferAsset };

export function draftTreasuryTransfer(governanceAccountId: string, values: TreasuryTransferValues): ProposalDraft {
  const asset = values.asset ?? HBAR_ASSET;
  const options = {
    governanceAccountId,
    recipientAccountId: values.recipientAccountId,
    amount: parseAmount(values.amount, asset.kind === "hbar" ? HBAR_DECIMALS : asset.decimals),
    tokenId: asset.kind === "token" ? asset.tokenId : undefined,
  };
  // Built once now so an invalid amount surfaces in the form, before anything is signed.
  buildTreasuryTransfer(options);

  return {
    path: "native",
    kind: "treasuryTransfer",
    target: `Recipient · ${values.recipientAccountId}`,
    buildInnerTransaction: () => buildTreasuryTransfer(options),
  };
}
