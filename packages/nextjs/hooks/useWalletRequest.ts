"use client";

import { useCallback, useState } from "react";
import { useHederaSigner } from "./useHederaSigner";
import { type Transaction, TransactionId } from "@hiero-ledger/sdk";
import { useQueryClient } from "@tanstack/react-query";
import { type ExecutedTransaction, WalletRequestExpiredError } from "~~/services/web3/hederaSigner";
import { extractIdentity } from "~~/utils/scaffold-hbar/hederaIdentity";

/** Which of a submission's transactions the wallet is being asked for: register, or schedule. */
export type WalletRequestStep = { action: "register" | "schedule"; step: number; steps: number };

/** A request the wallet holds right now, and how long it stays approvable after it was built. */
export type WalletRequest = WalletRequestStep & { validForSeconds: number };

/** A step the app stopped waiting for, which the network accepted after all. */
export type LateSubmission = WalletRequestStep & { transactionId: string };

type OnLateSuccess = (result: ExecutedTransaction) => void;

const MS_PER_SECOND = 1000;

/** When the network stops accepting `tx`: its valid start plus its valid duration, in epoch ms. */
export function transactionDeadlineMs(tx: Transaction): number {
  const validStart = tx.transactionId?.validStart;
  if (!validStart) throw new Error("A transaction's deadline is only known once its id is set");
  return validStart.toDate().getTime() + tx.transactionValidDuration * MS_PER_SECOND;
}

/**
 * `executeTransaction` of the active signer, abandoned at the transaction's own deadline. The network
 * refuses an expired transaction only when the wallet submits it, so a request left unanswered in
 * the wallet would otherwise never settle. The body the wallet signs fixes its valid start and
 * duration, so an approval after the deadline is refused; only a local clock running ahead of the
 * network's can end the wait early. For that case a late success is not dropped: every query is
 * refreshed and `onLateSuccess` lets the caller keep what the transaction created.
 */
export function useExecuteBeforeDeadline() {
  const { executeTransaction, requireAccountId, signerKind } = useHederaSigner();
  const queryClient = useQueryClient();

  return useCallback(
    async (tx: Transaction, onLateSuccess?: OnLateSuccess): Promise<ExecutedTransaction> => {
      // The test signer answers at once, and presetting its id would stop the SDK regenerating one
      // and retrying on TRANSACTION_EXPIRED; only a wallet a person answers needs a deadline.
      if (signerKind === "burner") return executeTransaction(tx);
      // Fixed here rather than by the signer, so the deadline is known before the wallet is asked.
      if (!tx.transactionId) tx.setTransactionId(TransactionId.generate(extractIdentity(requireAccountId())));
      const pending = executeTransaction(tx);

      let timer: ReturnType<typeof setTimeout> | undefined;
      const expired = new Promise<never>((_, reject) => {
        const expire = () => reject(new WalletRequestExpiredError(tx.transactionValidDuration));
        timer = setTimeout(expire, Math.max(0, transactionDeadlineMs(tx) - Date.now()));
      });

      try {
        return await Promise.race([pending, expired]);
      } catch (error) {
        if (error instanceof WalletRequestExpiredError) {
          pending.then(
            result => {
              void queryClient.invalidateQueries();
              onLateSuccess?.(result);
            },
            // A refusal after the deadline is the expected answer, and already reported.
            () => undefined,
          );
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
    [executeTransaction, requireAccountId, signerKind, queryClient],
  );
}

/**
 * `useExecuteBeforeDeadline`, remembering which step is waiting in the wallet until it answers or its
 * deadline passes, so a screen can say where to act while nothing seems to happen.
 */
export function useWalletRequest() {
  const execute = useExecuteBeforeDeadline();
  const [walletRequest, setWalletRequest] = useState<WalletRequest | null>(null);
  const [lateSubmission, setLateSubmission] = useState<LateSubmission | null>(null);

  const executeStep = useCallback(
    async (tx: Transaction, step: WalletRequestStep, onLateSuccess?: OnLateSuccess) => {
      setLateSubmission(null);
      setWalletRequest({ ...step, validForSeconds: tx.transactionValidDuration });
      try {
        return await execute(tx, result => {
          setLateSubmission({ ...step, transactionId: result.transactionId });
          onLateSuccess?.(result);
        });
      } finally {
        setWalletRequest(null);
      }
    },
    [execute],
  );

  return { walletRequest, lateSubmission, executeStep };
}
