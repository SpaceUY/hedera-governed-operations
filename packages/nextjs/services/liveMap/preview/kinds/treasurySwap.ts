import type { PreviewKind } from "./previewKind";
import { formatTinybars } from "~~/utils/scaffold-hbar/hbarAmount";

/** On the swap adapter, which the council's approval reaches: how much HBAR it would sell. */
export const TREASURY_SWAP_PREVIEW: PreviewKind<"treasurySwap"> = {
  labels: operation => [{ ref: operation.target, text: `would sell ${formatTinybars(operation.amountInTinybars)}` }],
};
