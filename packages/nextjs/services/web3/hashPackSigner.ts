import { type HederaSignerSession, executeTransaction, signTransaction } from "./hederaSigner";
import type { HederaSigner } from "./hederaSignerPort";
import type { Transaction } from "@hiero-ledger/sdk";

/** Binds the HashPack (WalletConnect) session to the signing port. */
export function createHashPackSigner(session: HederaSignerSession): HederaSigner {
  return {
    kind: "hashpack",
    accountId: session.accountId,
    network: session.network,
    executeTransaction: (tx: Transaction) => executeTransaction(session, tx),
    signTransaction: <T extends Transaction>(tx: T) => signTransaction(session, tx),
  };
}
