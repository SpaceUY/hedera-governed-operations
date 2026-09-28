import type { ProposalKind } from "@sh/core/governance/proposalTypes";

/**
 * The kinds the wizard offers, in the picker's order. Kept apart from `registry.ts`, which pulls in
 * every form, so that what only needs the list — the provider's first kind — does not.
 */
export const WIZARD_KINDS = [
  "upgrade",
  "treasurySwap",
  "tokenAdmin",
  "treasuryTransfer",
] as const satisfies readonly ProposalKind[];

export type WizardKind = (typeof WIZARD_KINDS)[number];
