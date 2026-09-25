import { type MirrorRequestOptions, isValidEntityId, mirrorRequest } from "./client";
import type { MirrorKey } from "./schedules";
import { normalizeTransactionId } from "./transactions";
import { isEvmAddress } from "~~/utils/scaffold-hbar/identity";

export type MirrorContractLog = {
  address: string;
  data: string;
  index: number;
  topics: string[];
};

/** Subset of GET /api/v1/contracts/results/{transactionIdOrHash}. */
export type MirrorContractResult = {
  contract_id: string | null;
  hash: string;
  from: string;
  to: string | null;
  amount: number;
  gas_limit: number;
  gas_used: number;
  gas_consumed: number;
  call_result: string;
  error_message: string | null;
  function_parameters: string;
  timestamp: string;
  block_number: number;
  logs: MirrorContractLog[];
};

function toContractResultId(transactionIdOrHash: string): string {
  const value = transactionIdOrHash.trim();
  return value.startsWith("0x") ? value : normalizeTransactionId(value);
}

/** Accepts a transaction id (either form) or a `0x…` EVM transaction hash. */
export async function fetchContractResult(
  transactionIdOrHash: string,
  options: MirrorRequestOptions = {},
): Promise<MirrorContractResult> {
  const id = toContractResultId(transactionIdOrHash);
  return mirrorRequest<MirrorContractResult>(`/api/v1/contracts/results/${encodeURIComponent(id)}`, options);
}

/** Contract entity from GET /api/v1/contracts/{id} (subset). */
export type MirrorContract = {
  contract_id: string;
  evm_address: string;
  admin_key: MirrorKey | null;
  auto_renew_account: string | null;
  created_timestamp: string;
  expiration_timestamp: string | null;
  deleted: boolean;
  memo: string;
  nonce: number;
  max_automatic_token_associations: number;
  /**
   * The deployed code, and the only field a release manifest can be checked against:
   * `bytecode` holds the creation code and comes back empty for a contract deployed
   * through the EVM rather than from a HAPI file.
   */
  runtime_bytecode: string | null;
  bytecode: string | null;
};

/** Accepts a `0.0.x` contract id or a `0x…` EVM address. */
export async function fetchContract(
  contractIdOrAddress: string,
  options: MirrorRequestOptions = {},
): Promise<MirrorContract> {
  const id = contractIdOrAddress.trim();
  if (!isValidEntityId(id) && !isEvmAddress(id)) {
    throw new Error(`Invalid contract ID: expected format 0.0.xxxxx or an EVM address, got ${id}`);
  }
  return mirrorRequest<MirrorContract>(`/api/v1/contracts/${encodeURIComponent(id)}`, options);
}
