/**
 * The registry side of a proposal: `GovernedExecutor` and the entry it stores.
 *
 * There are two records of "this proposal is still alive" and they are not the same object. The
 * schedule collects signatures and knows whether it ran, was deleted or expired; the registry entry
 * is `Pending | Executed | Cancelled`. They come apart through `cancel(id)`, which the proposer can
 * call straight away with no schedule and no quorum: that kills the proposal while the schedule goes
 * on looking open, and reaching its threshold then reverts with `ProposalNotPending` and charges the
 * governance account the gas consumed. Crossing the two is what keeps the inbox from offering a
 * signature on a proposal that is already dead.
 *
 * Reading this goes through the JSON-RPC relay rather than a `ContractCallQuery`, because the
 * browser holds no operator key. The relay also serves the state from a block or two back, so an
 * entry cancelled seconds ago can still read `Pending`; the inbox is eventually consistent here in
 * the same way it already is with the Mirror Node.
 */
import type { MirrorContractResult } from "../mirror";
import { createRelayClient } from "../relayClient";
import { decodeRegistryOperation } from "./decode";
import type { RegistryOperation } from "./proposalTypes";
import { ContractExecuteTransaction, ContractFunctionParameters, ContractId } from "@hiero-ledger/sdk";
import { type Address, type Hex, decodeFunctionResult, parseAbi, size } from "viem";

export const REGISTRY_ABI = parseAbi([
  "function createProposal(address target, bytes data) returns (uint256 id)",
  "function cancel(uint256 id)",
  "function proposal(uint256 id) view returns ((address target, address proposer, uint8 state, bytes data))",
]);

/** A `uint256` return value; anything else in `call_result` is not an id. */
const UINT256_BYTES = 32;

/** Measured on testnet: retiring an entry writes one slot and logs an event, and consumes 30,684. */
export const CANCEL_PROPOSAL_GAS = 60_000;

/** The order `GovernedExecutor.ProposalState` declares, which is what the entry stores. */
const REGISTRY_STATES = ["pending", "executed", "cancelled"] as const;

export type RegistryEntryState = (typeof REGISTRY_STATES)[number];

export type RegistryEntry = {
  proposalId: number;
  state: RegistryEntryState;
  target: Address;
  /**
   * Who called `createProposal`. `cancel` is open to this address and to any `EXECUTOR_ROLE`
   * holder, and nothing else, so this is the ground truth a screen authorizes a Cancel button
   * against — never the schedule's creator, which happens to be the same account in this app's own
   * flow but is not what the contract actually checks.
   */
  proposer: Address;
  /** The stored call, kept beside the decoded operation so a screen can show the raw bytes too. */
  calldata: Hex;
  operation: RegistryOperation;
};

/**
 * Whether a proposal's registry entry could be crossed with its schedule.
 *
 * `missing` and `unreachable` are deliberately not the same answer. `missing` is the registry
 * itself saying there is no usable entry — a proposal id that was never registered makes
 * `proposal(id)` revert — and signing such a schedule spends the council's approval on a call that
 * reverts and charges the governance account. `unreachable` only means the question could not be
 * asked. So a screen should refuse to sign on `missing` the way it does on a cancelled entry, and
 * merely warn on `unreachable`.
 *
 * `notApplicable` and `notRead` are not the same answer either. `notApplicable` is a proposal with no
 * entry to read, a native kind. `notRead` is a registry call whose entry exists but was left unread
 * because its schedule ran it and did not fail, so the entry has executed and nothing the council can
 * do depends on it any more: the inbox skips those to spare a relay read per row and poll.
 */
export type RegistryCrossCheck =
  | { status: "notApplicable" }
  | { status: "notRead" }
  | { status: "read"; entry: RegistryEntry }
  | { status: "missing"; reason: string }
  | { status: "unreachable"; reason: string };

export type RegistryLookup = {
  executorContractId: string;
  /** JSON-RPC relay endpoint; the browser has no operator key, so a `ContractCallQuery` is not an option. */
  rpcUrl: string;
};

/**
 * Retires a proposal for good, which `ScheduleDelete` does not: deleting a schedule ends one round
 * of approval and leaves the entry pending for anyone to schedule again. Withdrawing a proposal
 * properly is both, in that order — delete the schedule first, so no live schedule is left pointing
 * at an entry that reverts.
 */
export function buildCancelProposalCall(executorContractId: string, proposalId: number): ContractExecuteTransaction {
  return new ContractExecuteTransaction()
    .setContractId(ContractId.fromString(executorContractId))
    .setGas(CANCEL_PROPOSAL_GAS)
    .setFunction("cancel", new ContractFunctionParameters().addUint256(proposalId));
}

/**
 * The id `createProposal` returned, which the app needs to schedule `execute(id)` next and which no
 * signer hands back: a wallet returns a transaction id and nothing else. It comes from the contract
 * result the Mirror Node records, the same shape `scheduleIdFromTransaction` solves for a schedule.
 *
 * Null means "not yet": Mirror has recorded no return value. A registration that **failed** is a
 * different answer and throws, because the two are indistinguishable in the result otherwise — a
 * revert leaves its error payload in `call_result`, and reading that as a number would either blow
 * up or return a number so large it can never be an entry, leaving a caller polling for an id that
 * is never coming. A proposer without `PROPOSER_ROLE` is exactly that case.
 */
export function proposalIdFromContractResult(result: MirrorContractResult): number | null {
  if (result.error_message) {
    throw new Error(`Registering the proposal failed on chain: ${result.error_message}`);
  }
  if (!result.call_result || size(result.call_result as Hex) !== UINT256_BYTES) return null;

  try {
    const id = decodeFunctionResult({
      abi: REGISTRY_ABI,
      functionName: "createProposal",
      data: result.call_result as Hex,
    });
    return id > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(id);
  } catch {
    return null;
  }
}

/**
 * The registry entries behind a set of proposals, one read each. There is no batching: a multicall
 * would need a contract deployed for it, and the inbox only asks about the entries whose schedule has
 * not run them and that it has not already seen cancelled or executed, which are final answers.
 *
 * One entry that cannot be read leaves that proposal uncrossed instead of failing the whole inbox,
 * the same partial result the inbox already returns when a proposer cannot be read from Mirror.
 */
export async function fetchRegistryEntries(
  proposalIds: number[],
  { executorContractId, rpcUrl }: RegistryLookup,
): Promise<Map<number, RegistryCrossCheck>> {
  const relay = createRelayClient(rpcUrl);
  const address = `0x${ContractId.fromString(executorContractId).toEvmAddress()}` as Address;
  const unique = [...new Set(proposalIds)];

  const readings = await Promise.allSettled(
    unique.map(proposalId =>
      relay.readContract({ address, abi: REGISTRY_ABI, functionName: "proposal", args: [BigInt(proposalId)] }),
    ),
  );

  return new Map(
    unique.map((proposalId, index): [number, RegistryCrossCheck] => {
      const reading = readings[index];
      if (reading.status === "rejected") return [proposalId, failureOf(proposalId, reading.reason)];

      const { target, proposer, state, data } = reading.value;
      const known = REGISTRY_STATES[state];
      if (!known) {
        return [
          proposalId,
          { status: "missing", reason: `the registry reported state ${state}, which this app does not know` },
        ];
      }

      return [
        proposalId,
        {
          status: "read",
          entry: {
            proposalId,
            state: known,
            target,
            proposer,
            calldata: data,
            operation: decodeRegistryOperation(target, data),
          },
        },
      ];
    }),
  );
}

/** viem nests the cause, so the kind of failure is found by walking it rather than by its top type. */
type WalkableError = { walk?: (matches: (error: unknown) => boolean) => unknown };

const isRevert = (error: unknown): boolean => {
  const { walk } = (error ?? {}) as WalkableError;
  if (typeof walk !== "function") return false;
  return walk.call(error, nested => (nested as Error)?.name === "ContractFunctionRevertedError") !== null;
};

/**
 * A revert is the registry answering, not the relay failing: `proposal(id)` reverts on an id that
 * was never registered, which is a proposal nobody should be asked to sign.
 */
function failureOf(proposalId: number, error: unknown): RegistryCrossCheck {
  if (isRevert(error)) {
    return { status: "missing", reason: `the registry holds no entry ${proposalId}` };
  }
  return { status: "unreachable", reason: reasonOf(error) };
}

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message.split("\n")[0] : "the relay did not answer";
