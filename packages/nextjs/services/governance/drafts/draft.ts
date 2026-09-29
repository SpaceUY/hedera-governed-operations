/**
 * The seam between what a proposer typed and what the council approves, shared by every kind. A kind's
 * own module (`treasuryTransfer.ts`, `vaultUpgrade.ts`, …) converts its form's values to the smallest
 * unit and hands them to the encoders in `@sh/core/governance/encode`, which keep the chain's
 * invariants; `previewDraft` then reads the result back through the same decoders the detail page
 * uses, so the wizard shows what a council member will be shown, not what the form meant.
 */
import type { Transaction } from "@hiero-ledger/sdk";
import { decodeRegistryOperation, decodeScheduledOperation } from "@sh/core/governance/decode";
import type { RegistryProposal } from "@sh/core/governance/encode";
import type {
  ContractProposalKind,
  NativeProposalKind,
  RegistryOperation,
  ScheduledOperation,
} from "@sh/core/governance/proposalTypes";
import { scheduledBodyOf } from "@sh/core/governance/scheduledBody";
import { councilRuleLabel } from "~~/services/governance/proposalLabels";

export type ProposalDraft =
  | { path: "native"; kind: NativeProposalKind; target: string; buildInnerTransaction: () => Transaction }
  | { path: "registry"; kind: ContractProposalKind; target: string; proposal: RegistryProposal };

export type DraftPreview =
  | { path: "native"; kind: NativeProposalKind; target: string; scheduled: ScheduledOperation }
  | {
      path: "registry";
      kind: ContractProposalKind;
      target: string;
      operation: RegistryOperation;
      executeGas: number;
      payableTinybars: bigint;
      calldata: string;
    };

export type DraftResult =
  | { status: "empty" }
  | { status: "invalid"; message: string }
  | { status: "ready"; draft: ProposalDraft };

export function tryDraft(build: () => ProposalDraft): DraftResult {
  try {
    return { status: "ready", draft: build() };
  } catch (error) {
    return { status: "invalid", message: error instanceof Error ? error.message : String(error) };
  }
}

export function previewDraft(draft: ProposalDraft): DraftPreview {
  if (draft.path === "native") {
    const scheduled = decodeScheduledOperation(scheduledBodyOf(draft.buildInnerTransaction()));
    return { path: "native", kind: draft.kind, target: draft.target, scheduled };
  }

  const { target, calldata, executeGas, payableTinybars } = draft.proposal;
  return {
    path: "registry",
    kind: draft.kind,
    target: draft.target,
    operation: decodeRegistryOperation(target, calldata),
    executeGas,
    payableTinybars,
    calldata,
  };
}

/** A council approves what it is shown, so a body the decoder cannot fully read is never submitted. */
export function isPreviewRecognized(preview: DraftPreview): boolean {
  if (preview.path === "native") return preview.scheduled.kind !== "unrecognized";
  return preview.operation.kind !== "unrecognized";
}

/** The preview's "Function" row, read off the decoded operation rather than off the form. */
export function previewFunctionLabel(preview: DraftPreview): string {
  if (preview.path === "native") {
    return preview.scheduled.kind === "councilRotation"
      ? `AccountUpdate (native) → ThresholdKey ${councilRuleLabel(preview.scheduled.council)}`
      : "CryptoTransfer (native scheduled transaction)";
  }
  const { operation } = preview;
  switch (operation.kind) {
    case "upgrade":
      return `upgradeToAndCall(address,bytes) → ${operation.implementation}`;
    case "treasurySwap":
      return "swapExactHbarForToken(…)";
    case "tokenAdmin":
      return `${operation.operation}(…)`;
    case "unrecognized":
      return "unrecognized call";
  }
}
