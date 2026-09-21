import type { ExecutedTransaction } from "./hederaSigner";
import type { Transaction } from "@hiero-ledger/sdk";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

export type HederaSignerKind = "hashpack" | "burner";

/**
 * Signing port shared by the user's wallet (HashPack) and the ephemeral test signer the
 * Hedera Harness injects. Consumers build SDK transactions and never see which one is active.
 */
export type HederaSigner = {
  kind: HederaSignerKind;
  accountId: string;
  network: HederaNetworkName;
  executeTransaction: (tx: Transaction) => Promise<ExecutedTransaction>;
  signTransaction: <T extends Transaction>(tx: T) => Promise<T>;
};
