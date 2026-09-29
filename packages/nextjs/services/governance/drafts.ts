/**
 * The seam between what a proposer typed and what the council approves. Every value is converted to
 * its smallest unit here and handed to the encoders in `services/governance/encode.ts`, which keep
 * the chain's invariants; the preview then reads the result back through the same decoders the
 * detail page uses, so the wizard shows what a council member will be shown, not what the form meant.
 */
import type { Transaction } from "@hiero-ledger/sdk";
import { decodeRegistryOperation, decodeScheduledOperation } from "@sh/core/governance/decode";
import {
  type RegistryProposal,
  buildTreasuryTransfer,
  encodeTreasurySwap,
  encodeUpgrade,
} from "@sh/core/governance/encode";
import type {
  ContractProposalKind,
  NativeProposalKind,
  RegistryOperation,
  ScheduledOperation,
} from "@sh/core/governance/proposalTypes";
import { scheduledBodyOf } from "@sh/core/governance/scheduledBody";
import { type Abi, type Address, encodeFunctionData } from "viem";
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
