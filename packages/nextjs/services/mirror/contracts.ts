import { type MirrorRequestOptions, mirrorRequest } from "./client";
import { normalizeTransactionId } from "./transactions";

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
