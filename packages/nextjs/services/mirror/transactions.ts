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
