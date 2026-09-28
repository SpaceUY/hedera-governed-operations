import type { ProposalDraft } from "./draft";
import { buildTreasuryTransfer } from "@sh/core/governance/encode";
import { HBAR_DECIMALS, parseAmount } from "~~/utils/scaffold-hbar/hbarAmount";

/** The treasury is the only account a treasury transfer debits, and it pays for the schedule. */
export type TreasuryTransferTargets = { governanceAccountId: string };

export type TreasuryTransferValues = { recipientAccountId: string; amount: string };

export function draftTreasuryTransfer(governanceAccountId: string, values: TreasuryTransferValues): ProposalDraft {
  const options = {
    governanceAccountId,
    recipientAccountId: values.recipientAccountId,
    amount: parseAmount(values.amount, HBAR_DECIMALS),
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
