"use client";

import { useCallback } from "react";
import type { Transaction } from "@hiero-ledger/sdk";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import {
  type HederaSignerSession,
  executeTransaction as executeWithSession,
  signTransaction as signWithSession,
} from "~~/services/web3/hederaSigner";
import { useHederaWalletConnect } from "~~/services/web3/hederaWalletConnect";
import { getHederaNetworkNameFromChainId } from "~~/utils/scaffold-hbar";

export function useHederaSigner() {
  const { provider, accountId, isConnected, isInitializing, isBusy, disconnectWallet } = useHederaWalletConnect();
  const { targetNetwork } = useTargetNetwork();
  const network = getHederaNetworkNameFromChainId(targetNetwork.id);

  const requireProvider = useCallback(() => {
    if (!provider || !isConnected || !accountId) {
      throw new Error("Connect a Hedera wallet first");
    }
    return { provider, accountId };
  }, [provider, isConnected, accountId]);

  const requireSession = useCallback(
    (): HederaSignerSession => ({ ...requireProvider(), network }),
    [requireProvider, network],
  );

  const executeTransaction = useCallback(
    async (tx: Transaction) => executeWithSession(requireSession(), tx),
    [requireSession],
  );

  const signTransaction = useCallback(
    async <T extends Transaction>(tx: T) => signWithSession(requireSession(), tx),
    [requireSession],
  );

  return {
    provider,
    accountId,
    isConnected,
    isInitializing,
    isBusy,
    requireProvider,
    executeTransaction,
    signTransaction,
    disconnect: disconnectWallet,
  };
}
