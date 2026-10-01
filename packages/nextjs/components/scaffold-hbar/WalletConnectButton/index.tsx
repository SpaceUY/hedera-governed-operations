"use client";

import { useRef } from "react";
import { hederaNamespace } from "@hashgraph/hedera-wallet-connect";
import { useAppKit } from "@reown/appkit/react";
import { useHederaSigner } from "~~/hooks/useHederaSigner";

/**
 * Custom wallet connect UI (independent from Reown UI components): the account and the wallet's
 * name from the session. When the harness test signer is active it shows the account with a badge
 * instead of offering the wallet modal.
 */
export const WalletConnectButton = () => {
  const { open } = useAppKit();
  const { accountId, isConnected, isBusy, signerKind, walletName, disconnect } = useHederaSigner();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const isTestSigner = signerKind === "burner";

  if (!isConnected) {
    return (
      <button
        className="btn btn-primary"
        onClick={() => {
          void open({ view: "Connect", namespace: hederaNamespace });
        }}
        type="button"
      >
        Connect Wallet
      </button>
    );
  }

  return (
    <div className="dropdown dropdown-end">
      <details ref={menuRef}>
        <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-full border border-base-content/10 px-4 text-sm font-semibold tabular-nums whitespace-nowrap transition-colors hover:border-base-content/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <span>{accountId}</span>
          {walletName && (
            <span className="hidden max-w-32 truncate font-medium text-base-content/60 md:inline">{walletName}</span>
          )}
          {isTestSigner && <span className="badge badge-warning badge-sm">test signer</span>}
        </summary>
        <ul className="menu dropdown-content mt-2 z-[60] w-64 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg">
          <li className="menu-title">
            <span>Connected account</span>
          </li>
          <li>
            <button
              type="button"
              className="justify-start normal-case"
              onClick={() => {
                if (!accountId || !navigator?.clipboard?.writeText) return;
                void navigator.clipboard.writeText(accountId);
                menuRef.current?.removeAttribute("open");
              }}
            >
              Copy account ID
            </button>
          </li>
          <li>
            <button
              type="button"
              className="text-error justify-start normal-case"
              onClick={() => {
                menuRef.current?.removeAttribute("open");
                void disconnect();
              }}
              disabled={isBusy}
            >
              {isBusy ? "Disconnecting..." : "Disconnect"}
            </button>
          </li>
        </ul>
      </details>
    </div>
  );
};

// Compatibility aliases for existing imports during migration.
export const AppKitConnectButton = WalletConnectButton;
export const RainbowKitCustomConnectButton = WalletConnectButton;
