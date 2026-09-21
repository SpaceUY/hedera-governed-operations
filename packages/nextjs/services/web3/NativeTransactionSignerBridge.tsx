"use client";

import { type ReactNode, useEffect, useRef } from "react";
import type { Transaction } from "@hiero-ledger/sdk";
import { CapabilityError, setNativeTransactionSigner } from "@scaffold-hbar-ui/hooks";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { type HederaSignerSession, executeTransaction } from "~~/services/web3/hederaSigner";
import { useHederaWalletConnect } from "~~/services/web3/hederaWalletConnect";
import { getHederaNetworkNameFromChainId } from "~~/utils/scaffold-hbar";

/**
 * Registers scaffold-hbar-ui's native transaction signer with the current Hedera WalletConnect
 * session. A ref keeps the signer closure stable while always seeing the latest session.
 */
export function NativeTransactionSignerBridge({ children }: { children: ReactNode }) {
  const { provider, accountId } = useHederaWalletConnect();
  const { targetNetwork } = useTargetNetwork();
  const sessionRef = useRef<HederaSignerSession | null>(null);
  sessionRef.current =
    provider && accountId ? { provider, accountId, network: getHederaNetworkNameFromChainId(targetNetwork.id) } : null;

  useEffect(() => {
    setNativeTransactionSigner(async tx => {
      const session = sessionRef.current;
      if (!session) {
        throw new CapabilityError();
      }
      return executeTransaction(session, tx as Transaction);
    });
    return () => {
      setNativeTransactionSigner(undefined);
    };
  }, []);

  return <>{children}</>;
}
