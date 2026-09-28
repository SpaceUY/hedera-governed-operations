import { type MirrorRequestOptions, mirrorRequest } from "./client";

/** Accepts the SDK form `0.0.x@sec.nanos` and Mirror's `0.0.x-sec-nanos`. */
const TRANSACTION_ID_REGEX = /^(\d+\.\d+\.\d+)[@-](\d+)[.-](\d+)$/;

export type MirrorTransfer = {
  account: string;
  amount: number;
  is_approval: boolean;
};

/** One row of GET /api/v1/transactions/{id}; the same id can yield several rows (parent + scheduled child). */
export type MirrorTransaction = {
  transaction_id: string;
  transaction_hash: string;
  name: string;
  result: string;
  consensus_timestamp: string;
  valid_start_timestamp: string;
  charged_tx_fee: number;
  entity_id: string | null;
  scheduled: boolean;
  nonce: number;
  parent_consensus_timestamp: string | null;
  memo_base64: string;
  transfers: MirrorTransfer[];
};

export type MirrorTransactionsResponse = {
  transactions: MirrorTransaction[];
};

export function isTransactionId(value: string): boolean {
  return TRANSACTION_ID_REGEX.test(value.trim());
}

/** Normalizes either accepted form to the `0.0.x-sec-nanos` form Mirror uses in paths. */
export function normalizeTransactionId(transactionId: string): string {
  const match = TRANSACTION_ID_REGEX.exec(transactionId.trim());
  if (!match) {
    throw new Error(
      `Invalid transaction ID: expected 0.0.x@seconds.nanos or 0.0.x-seconds-nanos, got ${transactionId}`,
    );
  }
  const [, accountId, seconds, nanos] = match;
  return `${accountId}-${seconds}-${nanos}`;
}

/** Mirror answers 404 until the transaction is indexed (seconds after consensus): poll on not found. */
export async function fetchTransaction(
  transactionId: string,
  options: MirrorRequestOptions = {},
): Promise<MirrorTransaction[]> {
  const mirrorId = normalizeTransactionId(transactionId);
  const data = await mirrorRequest<MirrorTransactionsResponse>(`/api/v1/transactions/${mirrorId}`, options);
  return data.transactions ?? [];
}

/** Mirror's `seconds.nanos` form, e.g. a schedule's `executed_timestamp`. */
const CONSENSUS_TIMESTAMP_REGEX = /^\d+\.\d{1,9}$/;

/**
 * The transaction that reached consensus at `consensusTimestamp` (GET /api/v1/transactions?timestamp=).
 * The network gives every transaction a timestamp of its own, so the list holds at most one row; an
 * empty list means Mirror has not indexed it yet, since this endpoint answers 200 rather than 404.
 */
export async function fetchTransactionsAt(
  consensusTimestamp: string,
  options: MirrorRequestOptions = {},
): Promise<MirrorTransaction[]> {
  if (!CONSENSUS_TIMESTAMP_REGEX.test(consensusTimestamp)) {
    throw new Error(`Invalid consensus timestamp: expected seconds.nanos, got ${consensusTimestamp}`);
  }
  const data = await mirrorRequest<MirrorTransactionsResponse>(
    `/api/v1/transactions?timestamp=${consensusTimestamp}`,
    options,
  );
  return data.transactions ?? [];
}
