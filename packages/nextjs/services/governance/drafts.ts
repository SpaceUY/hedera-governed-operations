/**
 * The seam between what a proposer typed and what the council approves. Every value is converted to
 * its smallest unit here and handed to the encoders in `services/governance/encode.ts`, which keep
 * the chain's invariants; the preview then reads the result back through the same decoders the
 * detail page uses, so the wizard shows what a council member will be shown, not what the form meant.
 */
import type { Transaction } from "@hiero-ledger/sdk";
import { type Abi, type Address, encodeFunctionData } from "viem";
import { decodeRegistryOperation, decodeScheduledOperation } from "~~/services/governance/decode";
import { type RegistryProposal, buildTreasuryTransfer, encodeUpgrade } from "~~/services/governance/encode";
import type {
  ContractProposalKind,
  NativeProposalKind,
  RegistryOperation,
  ScheduledOperation,
} from "~~/services/governance/proposalTypes";
import { scheduledBodyOf } from "~~/services/governance/scheduledBody";
import { HBAR_DECIMALS, parseAmount } from "~~/utils/scaffold-hbar/hbarAmount";

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

export type VaultUpgradeTargets = {
  proxy: Address;
  proxyContractId: string;
  implementation: Address;
  implementationAbi: Abi;
};

export type VaultUpgradeValues = { withdrawalLimit: string };

/**
 * `initV2` is a reinitializer anyone can call once the proxy runs v2 code, so the upgrade has to run
 * it in the same transaction the council approves. An upgrade without it would leave the cap for the
 * first caller to set, and a cap of zero would refuse every withdrawal.
 */
export function draftVaultUpgrade(targets: VaultUpgradeTargets, values: VaultUpgradeValues): ProposalDraft {
  if (!values.withdrawalLimit.trim()) throw new Error("Set the withdrawal limit the upgrade will apply");

  const limitTinybars = parseAmount(values.withdrawalLimit, HBAR_DECIMALS);
  if (limitTinybars === 0n) throw new Error("A withdrawal limit of zero would refuse every withdrawal");

  const initializerCalldata = encodeFunctionData({
    abi: targets.implementationAbi,
    functionName: "initV2",
    args: [limitTinybars],
  } as const);
  return {
    path: "registry",
    kind: "upgrade",
    target: `Vault · ${targets.proxyContractId}`,
    proposal: encodeUpgrade({ proxy: targets.proxy, implementation: targets.implementation, initializerCalldata }),
  };
}

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
      ? "AccountUpdate (native) → threshold key"
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
