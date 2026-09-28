/**
 * The body a schedule carries, built from the transaction it wraps: what the council will be shown before the proposal exists.
 * `ScheduleCreate` wraps the inner transaction as a `SchedulableTransactionBody`, and that is the base64 the Mirror Node serves
 * as `transaction_body`, so going through the SDK gives the decoder exactly what it meets in
 * production without a network call.
 *
 * The bytes are not identical to the ones Mirror returns: the SDK writes an explicit empty memo and
 * explicit zero shard and realm, which the network leaves out. Assert on the decoded operation
 * rather than on the base64.
 */
import { proto } from "@hiero-ledger/proto";
import { AccountId, ScheduleCreateTransaction, type Transaction, TransactionId } from "@hiero-ledger/sdk";

/** Any node and payer will do: neither reaches the scheduled body, and freezing needs both. */
const NODE_ACCOUNT = new AccountId(3);
const PAYER_ACCOUNT = new AccountId(2);

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function scheduledBodyOf(innerTransaction: Transaction): string {
  const schedule = new ScheduleCreateTransaction()
    .setScheduledTransaction(innerTransaction)
    .setNodeAccountIds([NODE_ACCOUNT])
    .setTransactionId(TransactionId.generate(PAYER_ACCOUNT))
    .freeze();

  const [signedBytes] = proto.TransactionList.decode(schedule.toBytes()).transactionList;
  const body = proto.TransactionBody.decode(
    proto.SignedTransaction.decode(signedBytes.signedTransactionBytes!).bodyBytes!,
  );
  const scheduled = body.scheduleCreate?.scheduledTransactionBody;
  if (!scheduled) throw new Error("the frozen ScheduleCreate carries no scheduled transaction body");

  return bytesToBase64(proto.SchedulableTransactionBody.encode(scheduled).finish());
}
