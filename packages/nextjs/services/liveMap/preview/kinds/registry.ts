import { COUNCIL_ROTATION_PREVIEW } from "./councilRotation";
import type { KnownOperation, OperationOf, PreviewContext, PreviewKind, PreviewLabel } from "./previewKind";
import { TOKEN_ADMIN_PREVIEW } from "./tokenAdmin";
import { TREASURY_SWAP_PREVIEW } from "./treasurySwap";
import { TREASURY_TRANSFER_PREVIEW } from "./treasuryTransfer";
import { UPGRADE_PREVIEW } from "./upgrade";
import type { ProposalKind } from "@sh/core/governance/proposalTypes";

/** Every kind's words, one line each; the words themselves live in the kind's own module. */
export const PREVIEW_KINDS: { [K in ProposalKind]: PreviewKind<K> } = {
  upgrade: UPGRADE_PREVIEW,
  treasurySwap: TREASURY_SWAP_PREVIEW,
  tokenAdmin: TOKEN_ADMIN_PREVIEW,
  treasuryTransfer: TREASURY_TRANSFER_PREVIEW,
  councilRotation: COUNCIL_ROTATION_PREVIEW,
};

function labelsOfKind<K extends ProposalKind>(kind: K, operation: OperationOf<K>, context: PreviewContext) {
  return PREVIEW_KINDS[kind].labels(operation, context);
}

/** What the operation would do, as words on the entities it reaches. */
export function previewLabelsOf(operation: KnownOperation, context: PreviewContext): PreviewLabel[] {
  return labelsOfKind(operation.kind, operation, context);
}
