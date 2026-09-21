"use client";

import { type ReactNode, useEffect, useRef } from "react";
import type { Transaction } from "@hiero-ledger/sdk";
import { CapabilityError, setNativeTransactionSigner } from "@scaffold-hbar-ui/hooks";
import { useHederaSigner } from "~~/hooks/useHederaSigner";

type NativeSigner = (tx: Transaction) => Promise<{ transactionId: string }>;

/**
 * Registers scaffold-hbar-ui's native transaction signer with whichever Hedera signer is active
 * (HashPack session or harness test signer). A ref keeps the registered closure stable while
 * always seeing the latest signer.
 */
export function NativeTransactionSignerBridge({ children }: { children: ReactNode }) {
  const { isConnected, executeTransaction } = useHederaSigner();
  const signerRef = useRef<NativeSigner | null>(null);
  signerRef.current = isConnected ? executeTransaction : null;

  useEffect(() => {
    setNativeTransactionSigner(async tx => {
      const signer = signerRef.current;
      if (!signer) {
        throw new CapabilityError();
      }
      return signer(tx as Transaction);
    });
    return () => {
      setNativeTransactionSigner(undefined);
    };
  }, []);

  return <>{children}</>;
}
