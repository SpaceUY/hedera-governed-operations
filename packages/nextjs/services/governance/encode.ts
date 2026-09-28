/**
 * Turning a filled-in form into the transactions a proposal is made of.
 *
 * The two paths differ in shape, not by accident. A contract-backed proposal is registered first —
 * `createProposal(target, data)` stores the call — and the council then approves a schedule wrapping
 * `execute(id)`, so an encoder here returns the pieces of that pair. A native proposal has no
 * registry entry at all: the encoder returns the transaction itself, ready to be wrapped in a
 * schedule.
 *
 * Amounts are always in the smallest unit — tinybars for HBAR — the way `SwapProvider` already
 * states it. `msg.value` reaches a contract in tinybars on Hedera, never in wei, and turning what a
 * person typed into that unit is the UI's job; taking anything else here would put a conversion in
 * the one place a swap's two copies of the amount have to agree.
 *
 * What this file does not decide is copy. The schedule's memo is a label the caller chooses and the
 * decoder never reads back, so the default lives with the screen, next to `PROPOSAL_TYPES[kind].label`.
 */
import { PROPOSAL_TYPES, type TokenAdminOperation } from "./proposalTypes";
import { REGISTRY_ABI } from "./registry";
import { PROPOSAL_EXPIRY_SECONDS, fetchAccountPublicKey } from "./schedules";
import {
  AccountId,
  AccountUpdateTransaction,
  ContractExecuteTransaction,
  ContractId,
  Hbar,
  KeyList,
  type PublicKey,
  TokenId,
  TransferTransaction,
} from "@hiero-ledger/sdk";
import { type Address, type Hex, encodeFunctionData, hexToBytes, parseAbi, size } from "viem";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

/**
 * Registering a proposal stores its call in the registry's storage, and Hedera charges for that by
 * the slot, so the gas cannot be a constant. Measured on `GovernedExecutor` on testnet: 4 bytes of
 * calldata consume 100,263, 36 bytes 145,425, 100 bytes 191,355 and 196 bytes 260,251 — a straight
 * line of about 23,000 per 32-byte word over a fixed cost.
 *
 * The numbers below round that up generously on purpose. Unlike a scheduled call, a plain
 * `ContractExecute` is charged what it consumes and not its limit — the same call cost 0.2086 HBAR
 * at a 400,000 limit and at a 1,200,000 one — so headroom here is free, while falling short costs
 * the whole fee and returns `INSUFFICIENT_GAS`.
 */
export const PROPOSAL_REGISTRATION_BASE_GAS = 120_000;
export const PROPOSAL_REGISTRATION_GAS_PER_WORD = 30_000;

const BYTES_PER_WORD = 32;

const UPGRADE_ABI = parseAbi(["function upgradeToAndCall(address newImplementation, bytes data)"]);

const SWAP_ABI = parseAbi([
  "function swapExactHbarForToken(address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint256 deadline)",
]);

const TOKEN_ADMIN_ABI = parseAbi([
  "function pause(address token)",
  "function unpause(address token)",
  "function freeze(address token, address account)",
  "function unfreeze(address token, address account)",
]);

/** The pieces of a proposal that travels through the registry: what to store, and what each step costs. */
export type RegistryProposal = {
  target: Address;
  calldata: Hex;
  /** Gas for the `ContractExecute` that registers this, from the length of what it stores. */
  registerGas: number;
  /** Gas limit for the scheduled `execute(id)`, which has to cover the whole proposed operation. */
  executeGas: number;
  /** HBAR the scheduled `execute` has to carry, in tinybars. Only a treasury swap moves any. */
  payableTinybars: bigint;
};

export function createProposalGas(calldataByteLength: number): number {
  const words = Math.ceil(calldataByteLength / BYTES_PER_WORD);
  return PROPOSAL_REGISTRATION_BASE_GAS + PROPOSAL_REGISTRATION_GAS_PER_WORD * words;
}

function requirePositive(amount: bigint, what: string): void {
  if (amount > 0n) return;
  throw new Error(`${what} has to be more than zero, and it is ${amount}`);
}

export type UpgradeProposalOptions = {
  /** The proxy whose implementation changes; it is the proxy that gates on the executor, not the implementation. */
  proxy: Address;
  implementation: Address;
  /**
   * A call to run inside the upgrade, in the same transaction the council approved, so the proxy is
   * never live on new code with its new state unset. It is also what makes an upgrade expensive to
   * register: nesting a call roughly doubles the calldata the registry stores.
   */
  initializerCalldata?: Hex;
};

export function encodeUpgrade({
  proxy,
  implementation,
  initializerCalldata = "0x",
}: UpgradeProposalOptions): RegistryProposal {
  const calldata = encodeFunctionData({
    abi: UPGRADE_ABI,
    functionName: "upgradeToAndCall",
    args: [implementation, initializerCalldata],
  });

  return {
    target: proxy,
    calldata,
    registerGas: createProposalGas(size(calldata)),
    executeGas: PROPOSAL_TYPES.upgrade.executeGas,
    payableTinybars: 0n,
  };
}

export type TreasurySwapProposalOptions = {
  /** `SaucerSwapAdapter`, which only accepts calls from the executor. */
  adapter: Address;
  tokenOut: Address;
  /** Pool fee tier in hundredths of a basis point (3000 = 0.30%). */
  fee: number;
  /** Where the DEX pays the output; the governance account for a treasury swap. */
  recipient: Address;
  amountInTinybars: bigint;
  /**
   * The floor the council approves, in the output token's smallest unit. It is a limit order and not
   * a slippage tolerance: a proposal is approved hours or days after it is registered, so a
   * tolerance against the price at registration would mean nothing by the time the swap runs.
   */
  amountOutMinimum: bigint;
  /**
   * Unix seconds after which the DEX refuses the swap. It defaults to the proposal's own expiry,
   * because anything shorter would go stale while the council is still collecting signatures.
   *
   * The default is counted from **now**, when the proposal is encoded, not from when its schedule is
   * created. Registering and scheduling are two transactions and nothing forces them to be minutes
   * apart, so a proposal registered long before it is scheduled ends up with a deadline earlier than
   * its own expiry. Pass one explicitly when the two steps are not back to back.
   */
  deadline?: number;
};

export function encodeTreasurySwap({
  adapter,
  tokenOut,
  fee,
  recipient,
  amountInTinybars,
  amountOutMinimum,
  deadline = Math.floor(Date.now() / 1000) + PROPOSAL_EXPIRY_SECONDS,
}: TreasurySwapProposalOptions): RegistryProposal {
  requirePositive(amountInTinybars, "the HBAR a treasury swap sells");
  requirePositive(
    amountOutMinimum,
    "the floor a treasury swap is approved against, since a swap with no floor accepts any price the pool offers days later, and",
  );

  const calldata = encodeFunctionData({
    abi: SWAP_ABI,
    functionName: "swapExactHbarForToken",
    args: [tokenOut, fee, recipient, amountInTinybars, amountOutMinimum, BigInt(deadline)],
  });

  return {
    target: adapter,
    calldata,
    registerGas: createProposalGas(size(calldata)),
    executeGas: PROPOSAL_TYPES.treasurySwap.executeGas,
    /**
     * The adapter reverts with `ValueMismatch` unless the HBAR paid equals the `amountIn` in its
     * calldata. The two travel by different routes — one in the scheduled transaction, one in the
     * registry entry — so this is the single place they can be kept equal.
     */
    payableTinybars: amountInTinybars,
  };
}

export type TokenAdminProposalOptions = {
  /** `TokenAdmin`, the contract that holds the token's pause and freeze keys. */
  tokenAdmin: Address;
  operation: TokenAdminOperation;
  token: Address;
  /** The holder a freeze acts on. Pause and unpause act on the token as a whole and take none. */
  account?: Address;
};

export function encodeTokenAdmin({
  tokenAdmin,
  operation,
  token,
  account,
}: TokenAdminProposalOptions): RegistryProposal {
  const calldata = encodeTokenAdminCall(operation, token, account);

  return {
    target: tokenAdmin,
    calldata,
    registerGas: createProposalGas(size(calldata)),
    executeGas: PROPOSAL_TYPES.tokenAdmin.executeGas,
    payableTinybars: 0n,
  };
}

function encodeTokenAdminCall(operation: TokenAdminOperation, token: Address, account?: Address): Hex {
  if (operation === "pause" || operation === "unpause") {
    return encodeFunctionData({ abi: TOKEN_ADMIN_ABI, functionName: operation, args: [token] });
  }

  if (!account) throw new Error(`A ${operation} acts on one holder's balance, so it needs the account to ${operation}`);
  return encodeFunctionData({ abi: TOKEN_ADMIN_ABI, functionName: operation, args: [token, account] });
}

/** The transaction that registers a proposal, paid and signed by the proposer, not by the council. */
export function buildCreateProposalCall(
  executorContractId: string,
  proposal: RegistryProposal,
): ContractExecuteTransaction {
  return new ContractExecuteTransaction()
    .setContractId(ContractId.fromString(executorContractId))
    .setGas(proposal.registerGas)
    .setFunctionParameters(
      hexToBytes(
        encodeFunctionData({
          abi: REGISTRY_ABI,
          functionName: "createProposal",
          args: [proposal.target, proposal.calldata],
        }),
      ),
    );
}

export type TreasuryTransferOptions = {
  /** Payer of the schedule and the account being debited: the treasury itself. */
  governanceAccountId: string;
  recipientAccountId: string;
  /** In the smallest unit: tinybars for HBAR, or the token's own unit for an HTS transfer. */
  amount: bigint;
  /** Omit for HBAR. A holder that is not associated with the token cannot receive it. */
  tokenId?: string;
};

/**
 * A treasury payment, which needs no contract: `CryptoTransfer` is on the scheduling whitelist, so
 * the council approves the transfer itself and there is no registry entry behind it.
 */
export function buildTreasuryTransfer({
  governanceAccountId,
  recipientAccountId,
  amount,
  tokenId,
}: TreasuryTransferOptions): TransferTransaction {
  requirePositive(amount, "the amount a treasury transfer moves");

  const from = AccountId.fromString(governanceAccountId);
  const to = AccountId.fromString(recipientAccountId);
  if (from.equals(to)) throw new Error("The recipient is the treasury itself, so this transfer would move nothing");
  if (!tokenId) {
    return new TransferTransaction()
      .addHbarTransfer(from, Hbar.fromTinybars((-amount).toString()))
      .addHbarTransfer(to, Hbar.fromTinybars(amount.toString()));
  }

  const token = TokenId.fromString(tokenId);
  return new TransferTransaction().addTokenTransfer(token, from, -amount).addTokenTransfer(token, to, amount);
}

export type CouncilRotationOptions = {
  governanceAccountId: string;
  /** The incoming members, already resolved to public keys by `resolveCouncilMembers`. */
  memberKeys: PublicKey[];
  threshold: number;
};

/**
 * Changing who approves, using the same approval as everything else. Verified on testnet: a
 * scheduled key change needs **both** thresholds — the outgoing council's and the incoming one's —
 * and the schedule simply waits until it has them rather than failing, so a rotation collects
 * signatures from two sets of keys.
 */
export function buildCouncilRotation({
  governanceAccountId,
  memberKeys,
  threshold,
}: CouncilRotationOptions): AccountUpdateTransaction {
  requireReachableThreshold(memberKeys, threshold);

  return new AccountUpdateTransaction()
    .setAccountId(AccountId.fromString(governanceAccountId))
    .setKey(new KeyList(memberKeys, threshold));
}

function requireReachableThreshold(memberKeys: PublicKey[], threshold: number): void {
  if (memberKeys.length === 0) throw new Error("A council with no members could never approve anything");

  const distinct = new Set(memberKeys.map(key => key.toStringRaw()));
  if (distinct.size !== memberKeys.length) {
    throw new Error(
      "The proposed council lists the same key twice. A signature counts once however many seats hold the key, " +
        `so ${threshold} of ${memberKeys.length} would need more signers than it appears to`,
    );
  }

  if (threshold >= 1 && threshold <= memberKeys.length) return;
  throw new Error(`A threshold of ${threshold} is not reachable by a council of ${memberKeys.length}`);
}

/**
 * The public keys of the accounts a rotation names. It is a separate step so every encoder stays
 * synchronous and testable without a network, the same split `fetchAccountPublicKey` already made
 * for a schedule's admin key.
 */
export async function resolveCouncilMembers(accountIds: string[], network: HederaNetworkName): Promise<PublicKey[]> {
  return Promise.all(accountIds.map(accountId => fetchAccountPublicKey(accountId, network)));
}
