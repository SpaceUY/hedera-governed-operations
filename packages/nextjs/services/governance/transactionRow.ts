import { type MirrorTransaction, fetchTransaction } from "@sh/core/mirror";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";
import { MIRROR_INDEXING_RETRY_DELAYS_MS, waitForMirrorIndexing } from "~~/utils/scaffold-hbar/waitForMirrorIndexing";

type TransactionRowInput = {
  transactionId: string;
  /** The row's transaction type as Mirror names it: `SCHEDULESIGN`, `SCHEDULEDELETE`, … */
  name: string;
  network: HederaNetworkName;
};

/**
 * A transaction's own Mirror row once Mirror has indexed it, or null when the retry window ran out. A
 * wallet answers before consensus, so this row is the first place a write's result can be read.
 */
export async function waitForTransactionRow({
  transactionId,
  name,
  network,
}: TransactionRowInput): Promise<MirrorTransaction | null> {
  return waitForMirrorIndexing(
    async () => (await fetchTransaction(transactionId, { network })).find(row => row.name === name) ?? null,
    MIRROR_INDEXING_RETRY_DELAYS_MS,
  );
}
