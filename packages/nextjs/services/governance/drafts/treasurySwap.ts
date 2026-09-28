import type { ProposalDraft } from "./draft";
import { encodeTreasurySwap } from "@sh/core/governance/encode";
import { longZeroAddress } from "@sh/core/identity";
import type { Address } from "viem";
import { HBAR_DECIMALS, parseAmount } from "~~/utils/scaffold-hbar/hbarAmount";

export type TreasurySwapTargets = {
  /** `SaucerSwapAdapter`, the only contract the executor sells treasury HBAR through. */
  adapter: Address;
  adapterContractId: string;
  /** Pays for the swap and is paid out: the treasury's HBAR goes in, the token comes back to it. */
  governanceAccountId: string;
  tokenOutId: string;
  /** Pool fee tier in hundredths of a basis point, from the DEX's configuration. */
  fee: number;
};

/** `floor` is in the output token's own units, which is why its decimals travel with it. */
export type TreasurySwapValues = { amount: string; floor: string; tokenOutDecimals: number };

/**
 * The deadline is left to the encoder, which sets it to the proposal's own expiry: anything shorter
 * would go stale while the council is still collecting signatures.
 */
export function draftTreasurySwap(targets: TreasurySwapTargets, values: TreasurySwapValues): ProposalDraft {
  return {
    path: "registry",
    kind: "treasurySwap",
    target: `Swap adapter · ${targets.adapterContractId}`,
    proposal: encodeTreasurySwap({
      adapter: targets.adapter,
      tokenOut: longZeroAddress(targets.tokenOutId),
      fee: targets.fee,
      recipient: longZeroAddress(targets.governanceAccountId),
      amountInTinybars: parseAmount(values.amount, HBAR_DECIMALS),
      amountOutMinimum: parseAmount(values.floor, values.tokenOutDecimals),
    }),
  };
}
