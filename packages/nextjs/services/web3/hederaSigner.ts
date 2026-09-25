import type { HederaProvider } from "@hashgraph/hedera-wallet-connect";
import { type AccountId, Client, type Key, type Transaction, TransactionId } from "@hiero-ledger/sdk";
import { extractIdentity } from "~~/utils/scaffold-hbar/hederaIdentity";
import { base64StringToTransaction, transactionToBase64String } from "~~/utils/scaffold-hbar/hederaTxUtils";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

export type HederaSignerSession = {
  provider: HederaProvider;
  accountId: string;
  network: HederaNetworkName;
};

export type ExecutedTransaction = { transactionId: string };

export type BatchInnerTransactionOptions = {
  payer: AccountId | string;
  batchKey: Key;
};

export class WalletRejectedError extends Error {
  override readonly name = "WalletRejectedError";

  constructor(message = "The request was rejected in the wallet") {
    super(message);
  }
}

/** What a screen says when the user declined in the wallet: a choice they made, not a failure. */
export const WALLET_REJECTED_MESSAGE = "Request rejected in the wallet.";

const WALLET_CONNECT_USER_REJECTED_CODES = new Set([5000, 5001, 5002, 5003]);
const EIP1193_USER_REJECTED_CODE = 4001;
const USER_REJECTED_MESSAGE = /user.?reject|rejected by (the )?user/i;

export function isWalletRejection(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === EIP1193_USER_REJECTED_CODE) return true;
  if (typeof code === "number" && WALLET_CONNECT_USER_REJECTED_CODES.has(code)) return true;
  return typeof message === "string" && USER_REJECTED_MESSAGE.test(message);
}

const toWalletError = (error: unknown): unknown => (isWalletRejection(error) ? new WalletRejectedError() : error);

const clientsByNetwork = new Map<HederaNetworkName, Client>();

function clientForNetwork(network: HederaNetworkName): Client {
  const cached = clientsByNetwork.get(network);
  if (cached) return cached;
  const client =
    network === "mainnet"
      ? Client.forMainnet({ scheduleNetworkUpdate: false })
      : Client.forTestnet({ scheduleNetworkUpdate: false });
  clientsByNetwork.set(network, client);
  return client;
}

const caipAccountId = ({ network, accountId }: HederaSignerSession) =>
  `hedera:${network}:${extractIdentity(accountId)}`;

/**
 * `DAppSigner.freezeWithSigner` (hedera-wallet-connect 2.1.x) does not assign node account ids,
 * so a transaction frozen by the wallet cannot be executed. Freezing with a network client here
 * assigns them; the transaction id defaults to the connected account because the client has no operator.
 */
function freezeForWallet<T extends Transaction>(tx: T, session: HederaSignerSession): T {
  if (tx.isFrozen()) return tx;
  if (!tx.transactionId) tx.setTransactionId(TransactionId.generate(extractIdentity(session.accountId)));
  return tx.freezeWith(clientForNetwork(session.network));
}

export async function executeTransaction(session: HederaSignerSession, tx: Transaction): Promise<ExecutedTransaction> {
  const frozen = freezeForWallet(tx, session);
  try {
    const result = await session.provider.hedera_signAndExecuteTransaction({
      signerAccountId: caipAccountId(session),
      transactionList: transactionToBase64String(frozen),
    });
    if (!result?.transactionId) throw new Error("No transactionId returned from wallet");
    return { transactionId: result.transactionId };
  } catch (error) {
    throw toWalletError(error);
  }
}

/**
 * Signs without executing. The wallet returns its own `Transaction` instance; round-tripping through
 * base64 yields one built by the app's SDK copy so callers can keep working with it.
 */
export async function signTransaction<T extends Transaction>(session: HederaSignerSession, tx: T): Promise<T> {
  const frozen = freezeForWallet(tx, session);
  try {
    const signed = await session.provider.hedera_signTransaction({
      signerAccountId: caipAccountId(session),
      transactionBody: frozen,
    });
    return base64StringToTransaction<T>(transactionToBase64String(signed));
  } catch (error) {
    throw toWalletError(error);
  }
}

/**
 * Prepares an inner transaction of an atomic batch (HIP-551). With a batch key set, `freeze()` pins
 * the SDK's batch sentinel node (0.0.0); calling `setNodeAccountIds` would lock a real node list and
 * make the batch fail.
 */
export function prepareBatchInnerTransaction<T extends Transaction>(
  tx: T,
  { payer, batchKey }: BatchInnerTransactionOptions,
): T {
  return tx.setTransactionId(TransactionId.generate(payer)).setBatchKey(batchKey).freeze();
}
