/**
 * Turning a proposal back into something a person can read. A schedule carries its payload as a
 * base64 `SchedulableTransactionBody`, which is why the council's inbox would otherwise show a blob
 * where the operation should be.
 *
 * Nothing here throws on a payload it does not understand. Anyone can open a schedule the governance
 * account pays for, so the inbox will meet bodies that are none of the five kinds; a decoder that
 * threw would take the whole list down with it. Every failure comes back as `unrecognized` with the
 * reason, for the UI to show next to the raw body.
 *
 * The schedule's memo is deliberately not consulted. It is free text written by whoever opened the
 * proposal, so it can say "upgrade" over a body that transfers the treasury somewhere else. It is a
 * label, never evidence.
 *
 * Which is only true if the decoded body *is* evidence, and that takes a rule: **a field this file
 * does not read has to make the body unrecognised.** A description that silently drops part of a
 * transaction is worse than no description, because the council approves what it was shown. So the
 * bodies that carry more than one operation are checked by re-encoding what was understood and
 * comparing it to what arrived.
 */
import { type CouncilKey, councilKeyOf, governanceAccountMemo } from "./council";
import type {
  HbarTransfer,
  RegistryOperation,
  ScheduledOperation,
  TokenTransfer,
  UpgradeInitializer,
} from "./proposalTypes";
import { proto } from "@hiero-ledger/proto";
import { bytesToHex, decodeFunctionData, encodeFunctionData, parseAbi, toFunctionSelector } from "viem";

/** The call every contract-backed proposal schedules; its argument is the registry entry to run. */
const EXECUTE_ABI = parseAbi(["function execute(uint256 id)"]);
const EXECUTE_SELECTOR = toFunctionSelector("execute(uint256)");

/**
 * Every call this template knows how to describe. Read from here rather than from
 * `deployedContracts.ts`, which is empty until the first deploy, so a freshly cloned repo can still
 * decode a proposal it is shown.
 */
const REGISTRY_OPERATION_ABI = parseAbi([
  "function upgradeToAndCall(address newImplementation, bytes data)",
  "function swapExactHbarForToken(address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint256 deadline)",
  "function pause(address token)",
  "function unpause(address token)",
  "function freeze(address token, address account)",
  "function unfreeze(address token, address account)",
]);

/** The initializers an upgrade of this template runs; `initV2` sets the vault's withdrawal limit. */
const INITIALIZER_ABI = parseAbi(["function initV2(uint256 limit)"]);

/**
 * An initializer runs arbitrary code on the new implementation, so one this file cannot fully read
 * leaves the upgrade undescribed: `null`. viem ignores bytes after the arguments, which is why what
 * was understood is re-encoded and compared with what arrived.
 */
function decodeInitializer(calldata: string): UpgradeInitializer | null {
  if (calldata === "0x") return { kind: "none" };
  try {
    const { args } = decodeFunctionData({ abi: INITIALIZER_ABI, data: calldata as `0x${string}` });
    const reencoded = encodeFunctionData({ abi: INITIALIZER_ABI, functionName: "initV2", args });
    if (reencoded.toLowerCase() !== calldata.toLowerCase()) return null;
    return { kind: "setWithdrawalLimit", limitTinybars: args[0] };
  } catch {
    return null;
  }
}

function decodeKnownCall(calldata: string) {
  try {
    return decodeFunctionData({ abi: REGISTRY_OPERATION_ABI, data: calldata as `0x${string}` });
  } catch {
    return null;
  }
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Protobuf numbers arrive as `Long`, which loses precision through `Number` but not through its text. */
const numeric = (value: unknown): number => Number(value?.toString() ?? 0);

const bigIntOf = (value: unknown): bigint => BigInt(value?.toString() ?? 0);

/** Shard and realm are omitted from the wire when they are zero, which on Hedera they almost always are. */
const entityId = (shard: unknown, realm: unknown, num: unknown): string =>
  `${numeric(shard)}.${numeric(realm)}.${numeric(num)}`;

/**
 * A contract or an account can arrive named by an EVM address or a key alias instead of a number,
 * and there is no converting one to the other without asking the Mirror Node. Reading only the
 * number would render every one of them as `0.0.0` — a real account, and the wrong one — so the
 * address is carried through as it came and resolving it is left to whoever is rendering.
 */
const contractId = (id: proto.IContractID): string =>
  id.evmAddress?.length ? bytesToHex(id.evmAddress) : entityId(id.shardNum, id.realmNum, id.contractNum);

const accountId = (id: proto.IAccountID): string =>
  id.alias?.length ? bytesToHex(id.alias) : entityId(id.shardNum, id.realmNum, id.accountNum);

const tokenId = (id: proto.ITokenID): string => entityId(id.shardNum, id.realmNum, id.tokenNum);

const unrecognized = (reason: string): ScheduledOperation => ({ kind: "unrecognized", reason });

function decodeContractCall(call: proto.IContractCallTransactionBody): ScheduledOperation {
  if (!call.contractID) return unrecognized("the scheduled contract call names no contract");
  if (!call.functionParameters?.length) return unrecognized("the scheduled contract call carries no calldata");

  const calldata = bytesToHex(call.functionParameters);
  if (!calldata.startsWith(EXECUTE_SELECTOR)) {
    return unrecognized(`the call starts with ${calldata.slice(0, 10)}, which is not execute(uint256)`);
  }

  // The selector matching says nothing about the argument: a truncated or absent one makes viem
  // throw, and one bad row would take down the whole inbox.
  let args: readonly [bigint];
  try {
    ({ args } = decodeFunctionData({ abi: EXECUTE_ABI, data: calldata }));
  } catch {
    return unrecognized(`the call is execute(uint256) but carries no readable proposal id`);
  }
  const [id] = args;
  if (id > BigInt(Number.MAX_SAFE_INTEGER))
    return unrecognized(`the proposal id ${id} is too large to be a registry entry`);

  return {
    kind: "registryCall",
    executorContractId: contractId(call.contractID),
    proposalId: Number(id),
    gas: numeric(call.gas),
    payableTinybars: bigIntOf(call.amount),
  };
}

function decodeTransfer(transfer: proto.ICryptoTransferTransactionBody): ScheduledOperation {
  const hasNfts = transfer.tokenTransfers?.some(token => token.nftTransfers?.length);
  if (hasNfts) {
    return unrecognized("the transfer moves NFTs, which this template's treasury transfers do not build");
  }

  const hbar: HbarTransfer[] = [];
  for (const movement of transfer.transfers?.accountAmounts ?? []) {
    if (!movement.accountID) continue;
    hbar.push({ accountId: accountId(movement.accountID), tinybars: bigIntOf(movement.amount) });
  }

  const tokens: TokenTransfer[] = [];
  for (const entry of transfer.tokenTransfers ?? []) {
    const token = entry.token;
    if (!token) continue;
    for (const movement of entry.transfers ?? []) {
      if (!movement.accountID) continue;
      tokens.push({
        tokenId: tokenId(token),
        accountId: accountId(movement.accountID),
        amount: bigIntOf(movement.amount),
      });
    }
  }

  if (hbar.length === 0 && tokens.length === 0) return unrecognized("the transfer moves nothing");
  return { kind: "treasuryTransfer", hbar, tokens };
}

/**
 * True when the update changes nothing beyond the account it names, its key and its memo.
 * `CryptoUpdate` carries around twenty fields — the account's own expiry, its automatic association
 * slots, whether it requires a receiver signature, its staking — and a rotation that quietly also set
 * one of those would be approved as "changes who approves". Re-encoding the three fields that were
 * read and comparing the bytes catches every one of them, including any the protocol adds later.
 */
function changesOnlyTheCouncil(update: proto.ICryptoUpdateTransactionBody): boolean {
  const arrived = proto.CryptoUpdateTransactionBody.encode(update).finish();
  const understood = proto.CryptoUpdateTransactionBody.encode({
    accountIDToUpdate: update.accountIDToUpdate,
    key: update.key,
    memo: update.memo,
  }).finish();
  return Buffer.from(arrived).equals(Buffer.from(understood));
}

/**
 * A rotation may rewrite the account's memo, and `buildCouncilRotation` does, but only to the rule
 * of the council it proposes: any other text would be a rename riding along with the key. A rotation
 * that leaves the memo alone — one scheduled before rotations rewrote it — is still a rotation.
 */
function memoFollowsCouncil(memo: proto.ICryptoUpdateTransactionBody["memo"], council: CouncilKey): boolean {
  if (memo == null) return true;
  return memo.value === governanceAccountMemo(council.threshold, council.memberKeys.length);
}

function decodeAccountUpdate(update: proto.ICryptoUpdateTransactionBody): ScheduledOperation {
  if (!update.accountIDToUpdate) return unrecognized("the account update names no account");
  if (!update.key) {
    return unrecognized("the account update changes something other than the key, so it rotates no council");
  }
  if (!changesOnlyTheCouncil(update)) {
    return unrecognized(
      "the account update changes the key and something else about the account as well, so describing it as a " +
        "council rotation would hide the rest",
    );
  }

  let council: CouncilKey;
  try {
    council = councilKeyOf(update.key);
  } catch (error) {
    return unrecognized(`the proposed key is not a council: ${(error as Error).message}`);
  }
  if (!memoFollowsCouncil(update.memo, council)) {
    // The memo is left out of the reason on purpose: it is text whoever opened the proposal chose, and the
    // co-signing agent copies the reason into the decision it publishes.
    return unrecognized(
      "the account update also sets the account's memo to text that does not name the council it proposes",
    );
  }

  return { kind: "councilRotation", accountId: accountId(update.accountIDToUpdate), council };
}

/**
 * What a schedule's body says, without a single network call. Contract-backed proposals only get as
 * far as the registry entry they run; `decodeRegistryOperation` finishes the job on what the
 * registry stores under that id.
 */
export function decodeScheduledOperation(transactionBody: string): ScheduledOperation {
  if (!transactionBody) return unrecognized("the Mirror Node has no body recorded for this schedule");

  let body: proto.SchedulableTransactionBody;
  try {
    body = proto.SchedulableTransactionBody.decode(base64ToBytes(transactionBody));
  } catch (error) {
    return unrecognized(`the body does not decode as a scheduled transaction: ${(error as Error).message}`);
  }

  if (body.contractCall) return decodeContractCall(body.contractCall);
  if (body.cryptoTransfer) return decodeTransfer(body.cryptoTransfer);
  if (body.cryptoUpdateAccount) return decodeAccountUpdate(body.cryptoUpdateAccount);
  return unrecognized(`the scheduled transaction is a ${body.data || "transaction of an unknown type"}`);
}

/**
 * What a registry entry does, from the call it stores. A selector match names the operation; it does
 * not prove `target` is one of this template's contracts, so the target travels with the answer and
 * anything that gates on it — the co-signing agent's allowlist — checks it separately.
 *
 * Addresses come back EIP-55 checksummed whatever casing the calldata carried, so compare them
 * case-insensitively rather than with `===` against something read elsewhere.
 */
export function decodeRegistryOperation(target: string, calldata: string): RegistryOperation {
  const unknown = (reason: string): RegistryOperation => ({ kind: "unrecognized", target, calldata, reason });

  if (!calldata || calldata === "0x") return unknown("the registry entry stores no calldata");

  const call = decodeKnownCall(calldata);
  if (!call) return unknown(`no operation of this template starts with ${calldata.slice(0, 10)}`);

  switch (call.functionName) {
    case "upgradeToAndCall": {
      const [implementation, initializerCalldata] = call.args;
      const initializer = decodeInitializer(initializerCalldata);
      if (!initializer) {
        return unknown(
          `the upgrade runs an initializer this template cannot describe, starting with ${initializerCalldata.slice(0, 10)}`,
        );
      }
      return { kind: "upgrade", target, implementation, initializerCalldata, initializer };
    }
    case "swapExactHbarForToken": {
      const [tokenOut, fee, recipient, amountIn, amountOutMinimum, deadline] = call.args;
      return {
        kind: "treasurySwap",
        target,
        tokenOut,
        fee,
        recipient,
        amountInTinybars: amountIn,
        amountOutMinimum,
        deadline: Number(deadline),
      };
    }
    case "pause":
    case "unpause":
      return { kind: "tokenAdmin", target, operation: call.functionName, token: call.args[0], account: null };
    case "freeze":
    case "unfreeze":
      return {
        kind: "tokenAdmin",
        target,
        operation: call.functionName,
        token: call.args[0],
        account: call.args[1],
      };
  }
}
