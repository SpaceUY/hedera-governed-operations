import { type PreviewKind, configuredRefs } from "./previewKind";
import { MAP_ENTITY_IDS } from "~~/services/liveMap/model/graphEntities";
import { formatTinybars } from "~~/utils/scaffold-hbar/hbarAmount";

/**
 * On the swap adapter, which the council's approval reaches: how much HBAR it would sell. The wizard
 * settles a swap's proceeds to the treasury, so a sketch ends there too.
 */
export const TREASURY_SWAP_PREVIEW: PreviewKind<"treasurySwap"> = {
  labels: operation => [{ ref: operation.target, text: `would sell ${formatTinybars(operation.amountInTinybars)}` }],
  sketch: context => ({
    refs: { subject: configuredRefs(context, MAP_ENTITY_IDS.swapAdapter), recipient: [context.governanceAccountId] },
    words: [{ role: "subject", text: "would sell HBAR" }],
  }),
};
