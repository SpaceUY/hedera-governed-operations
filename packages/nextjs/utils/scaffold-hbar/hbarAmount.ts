import { Hbar, HbarUnit } from "@hiero-ledger/sdk";
import { parseUnits } from "viem";

/** HBAR is fixed-point with this many places: one HBAR is 10^8 tinybars. */
export const HBAR_DECIMALS = 8;

const DECIMAL_AMOUNT = /^\d+(\.\d+)?$/;

/**
 * What a person typed, in the smallest unit of an asset with `decimals` places. Stricter than
 * `parseUnits`, which rounds the digits past `decimals` away: an amount that changes between the form
 * and the transaction is exactly what a council must never be shown.
 */
export function parseAmount(text: string, decimals: number): bigint {
  const trimmed = text.trim();
  if (!DECIMAL_AMOUNT.test(trimmed)) {
    throw new Error(`"${text}" is not an amount: use digits and at most one decimal point`);
  }

  const fraction = trimmed.split(".")[1] ?? "";
  if (fraction.length > decimals) {
    throw new Error(`This asset has ${decimals} decimal places, and "${trimmed}" has ${fraction.length}`);
  }
  return parseUnits(trimmed, decimals);
}

/**
 * An amount in ℏ whatever its size. `Hbar.toString()` switches to tinybars (`tℏ`) below one HBAR, so
 * a zero reserve reads "0 tℏ", and `toString(HbarUnit.Hbar)` writes small amounts in exponent form
 * ("1e-8 ℏ"); `toFixed()` keeps every digit as plain decimals.
 */
export function formatTinybars(tinybars: bigint | number | string): string {
  return `${Hbar.fromTinybars(tinybars.toString()).to(HbarUnit.Hbar).toFixed()} ℏ`;
}
