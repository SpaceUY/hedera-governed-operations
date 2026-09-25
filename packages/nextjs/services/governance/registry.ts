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
import { decodeRegistryOperation } from "./decode";
import type { RegistryOperation } from "./proposalTypes";
import { ContractExecuteTransaction, ContractFunctionParameters, ContractId } from "@hiero-ledger/sdk";
import { type Address, type Hex, createPublicClient, decodeFunctionResult, http, parseAbi } from "viem";
import type { MirrorContractResult } from "~~/services/mirror";

export const REGISTRY_ABI = parseAbi([
  "function createProposal(address target, bytes data) returns (uint256 id)",
  "function cancel(uint256 id)",
  "function proposal(uint256 id) view returns ((address target, address proposer, uint8 state, bytes data))",
]);

/** Measured on testnet: retiring an entry writes one slot and logs an event, and consumes 30,684. */
export const CANCEL_PROPOSAL_GAS = 60_000;

/** The order `GovernedExecutor.ProposalState` declares, which is what the entry stores. */
const REGISTRY_STATES = ["pending", "executed", "cancelled"] as const;

export type RegistryEntryState = (typeof REGISTRY_STATES)[number];

export type RegistryEntry = {
  proposalId: number;
  state: RegistryEntryState;
  target: Address;
  /** The stored call, kept beside the decoded operation so a screen can show the raw bytes too. */
  calldata: Hex;
  operation: RegistryOperation;
};

/**
 * Whether a proposal's registry entry could be crossed with its schedule. `notApplicable` covers the
 * two native kinds, which have no entry at all, and anything whose body never named this executor.
 */
export type RegistryCrossCheck =
  | { status: "notApplicable" }
  | { status: "read"; entry: RegistryEntry }
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
 * Null while Mirror is still indexing and the result carries no return value yet.
 */
export function proposalIdFromContractResult(result: MirrorContractResult): number | null {
  if (!result.call_result || result.call_result === "0x") return null;

  const id = decodeFunctionResult({
    abi: REGISTRY_ABI,
    functionName: "createProposal",
    data: result.call_result as Hex,
  });

  return id > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(id);
}

/**
 * The registry entries behind a set of proposals, one read each. There is no batching: a multicall
 * would need a contract deployed for it, and the inbox only ever asks about the proposals that are
 * still pending and go through the executor — the settled ones already know how they ended.
 *
 * One entry that cannot be read leaves that proposal uncrossed instead of failing the whole inbox,
 * the same partial result the inbox already returns when a proposer cannot be read from Mirror.
 */
export async function fetchRegistryEntries(
  proposalIds: number[],
  { executorContractId, rpcUrl }: RegistryLookup,
): Promise<Map<number, RegistryCrossCheck>> {
  const relay = createPublicClient({ transport: http(rpcUrl) });
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
      if (reading.status === "rejected") {
        return [proposalId, { status: "unreachable", reason: reasonOf(reading.reason) }];
      }

      const { target, state, data } = reading.value;
      return [
        proposalId,
        {
          status: "read",
          entry: {
            proposalId,
            state: REGISTRY_STATES[state] ?? "pending",
            target,
            calldata: data,
            operation: decodeRegistryOperation(target, data),
          },
        },
      ];
    }),
  );
}

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message.split("\n")[0] : "the relay did not answer";
