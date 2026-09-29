import type { ProposalDraft } from "./draft";
import { encodeTreasurySwap } from "@sh/core/governance/encode";
import type { Address } from "viem";
import { HBAR_DECIMALS, parseAmount } from "~~/utils/scaffold-hbar/hbarAmount";

export type TreasurySwapTargets = {
  adapter: Address;
  adapterContractId: string;
  /** The token the DEX pays out, as the EVM addresses it. */
  tokenOut: Address;
  /** Where the DEX pays it: the governance account, so the output lands back in the treasury. */
  recipient: Address;
  /** Pool fee tier in hundredths of a basis point (3000 = 0.30%). */
  fee: number;
};

export type TreasurySwapValues = {
  amountIn: string;
  floor: string;
  /**
   * The output token's decimal places, read from the Mirror Node rather than assumed. Testnet USDC
   * has six and HBAR has eight, so reading the floor with HBAR's would understate it a hundredfold.
   */
  floorDecimals: number;
};

/**
 * The floor is the whole point of the form: the council approves a limit, not a slippage tolerance,
 * because the swap runs whenever the last signature lands. `encodeTreasurySwap` refuses a swap
 * without one, so nothing here needs to repeat that.
 */
export function draftTreasurySwap(targets: TreasurySwapTargets, values: TreasurySwapValues): ProposalDraft {
  if (!values.amountIn.trim()) throw new Error("Set the HBAR this swap sells");
  if (!values.floor.trim()) throw new Error("Set the floor: the least the treasury accepts for that HBAR");

  return {
    path: "registry",
    kind: "treasurySwap",
    target: `Swap adapter · ${targets.adapterContractId}`,
    proposal: encodeTreasurySwap({
      adapter: targets.adapter,
      tokenOut: targets.tokenOut,
      fee: targets.fee,
      recipient: targets.recipient,
      amountInTinybars: parseAmount(values.amountIn, HBAR_DECIMALS),
      amountOutMinimum: parseAmount(values.floor, values.floorDecimals),
    }),
  };
}
