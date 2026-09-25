"use client";

import { useState } from "react";
import { hederaNamespace } from "@hashgraph/hedera-wallet-connect";
import { useAppKit } from "@reown/appkit/react";
import { useHederaSigner } from "~~/hooks/useHederaSigner";
import { WALLET_REJECTED_MESSAGE, isWalletRejection } from "~~/services/web3/hederaSigner";

const FAILED_MESSAGE = "Wallet action failed. Try again.";

const toFriendlyMessage = (error: unknown) => (isWalletRejection(error) ? WALLET_REJECTED_MESSAGE : FAILED_MESSAGE);

/**
 * Inline HashPack connect control for feature pages: connect, show the `0.0.x` account, disconnect.
 * Wallet errors (including user rejections) are shown inline instead of thrown.
 */
export const ConnectWallet = () => {
  const { open } = useAppKit();
  const { accountId, isConnected, isInitializing, isBusy, signerKind, disconnect } = useHederaSigner();
  const [message, setMessage] = useState<string | null>(null);
  const isDisabled = isInitializing || isBusy;

  const runWalletAction = async (action: () => Promise<unknown>) => {
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(toFriendlyMessage(error));
    }
  };

  const handleConnect = () => runWalletAction(() => open({ view: "Connect", namespace: hederaNamespace }));
  const handleDisconnect = () => runWalletAction(disconnect);

  return (
    <div className="flex flex-col gap-2">
      {isConnected && accountId ? (
        <div className="flex items-center gap-2">
          <span className="badge badge-outline font-mono">{accountId}</span>
          {signerKind === "burner" && <span className="badge badge-warning badge-sm">test signer</span>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleDisconnect} disabled={isDisabled}>
            {isBusy ? "Disconnecting..." : "Disconnect"}
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-primary btn-sm" onClick={handleConnect} disabled={isDisabled}>
          Connect wallet
        </button>
      )}
      {message && (
        <p role="alert" className="text-sm text-error">
          {message}
        </p>
      )}
    </div>
  );
};
