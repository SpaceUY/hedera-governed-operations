"use client";

import { useCallback, useMemo } from "react";
import type { Transaction } from "@hiero-ledger/sdk";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { useBurnerSigner } from "~~/services/web3/BurnerSignerProvider";
import { createHashPackSigner } from "~~/services/web3/hashPackSigner";
import type { HederaSigner, HederaSignerKind } from "~~/services/web3/hederaSignerPort";
import { useHederaWalletConnect } from "~~/services/web3/hederaWalletConnect";
import { getHederaNetworkNameFromChainId } from "~~/utils/scaffold-hbar";

const NOT_CONNECTED_MESSAGE = "Connect a Hedera wallet first";

/**
 * Single signing entry point for components: the harness test signer when its key is present
 * (see `BurnerSignerProvider`), the HashPack session otherwise. `signerKind` tells the UI which one is active.
 */
export function useHederaSigner() {
  const wallet = useHederaWalletConnect();
  const burner = useBurnerSigner();
  const { targetNetwork } = useTargetNetwork();
  const network = getHederaNetworkNameFromChainId(targetNetwork.id);

  const hashPackSigner = useMemo<HederaSigner | null>(
    () =>
      wallet.provider && wallet.isConnected && wallet.accountId
        ? createHashPackSigner({ provider: wallet.provider, accountId: wallet.accountId, network })
        : null,
    [wallet.provider, wallet.isConnected, wallet.accountId, network],
  );

  const signer: HederaSigner | null = burner.signer ?? hashPackSigner;
  const signerKind: HederaSignerKind = burner.signer ? "burner" : "hashpack";

  const requireSigner = useCallback((): HederaSigner => {
    if (!signer) throw new Error(NOT_CONNECTED_MESSAGE);
    return signer;
  }, [signer]);

  const requireAccountId = useCallback(() => requireSigner().accountId, [requireSigner]);

  const requireProvider = useCallback(() => {
    if (burner.signer) throw new Error("HashPack provider is not available with the test signer");
    if (!wallet.provider || !wallet.isConnected || !wallet.accountId) throw new Error(NOT_CONNECTED_MESSAGE);
    return { provider: wallet.provider, accountId: wallet.accountId };
  }, [burner.signer, wallet.provider, wallet.isConnected, wallet.accountId]);

  const executeTransaction = useCallback(
    async (tx: Transaction) => requireSigner().executeTransaction(tx),
    [requireSigner],
  );

  const signTransaction = useCallback(
    async <T extends Transaction>(tx: T) => requireSigner().signTransaction(tx),
    [requireSigner],
  );

  const disconnect = useCallback(async () => {
    if (burner.signer) {
      burner.deactivate();
      return;
    }
    await wallet.disconnectWallet();
  }, [burner, wallet]);

  return {
    provider: wallet.provider,
    accountId: signer?.accountId ?? null,
    isConnected: signer !== null,
    isInitializing: wallet.isInitializing || burner.status === "resolving",
    isBusy: wallet.isBusy,
    signerKind,
    requireProvider,
    requireAccountId,
    requireSigner,
    executeTransaction,
    signTransaction,
    disconnect,
  };
}
