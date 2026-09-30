"use client";

import { useEffect, useRef } from "react";
import { WALLET_LIMIT_COPY } from "./copy";
import { hederaNamespace } from "@hashgraph/hedera-wallet-connect";
import { useAppKit } from "@reown/appkit/react";
import { useHederaSigner } from "~~/hooks/useHederaSigner";

/** Which action the connected wallet cannot sign: both start with a `ScheduleDelete`. */
export type WalletLimitAction = "withdraw" | "cancelLive";

type WalletLimitDialogProps = {
  action: WalletLimitAction | null;
  onClose: () => void;
};

/**
 * Opens in place of the wallet prompt, so a person is never sent to a wallet that can only answer
 * Reject. "Use another wallet" disconnects this one and opens the wallet chooser.
 */
export const WalletLimitDialog = ({ action, onClose }: WalletLimitDialogProps) => {
  const { open } = useAppKit();
  const { disconnect } = useHederaSigner();
  const primaryButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (action) primaryButton.current?.focus();
  }, [action]);

  if (!action) return null;

  const useAnotherWallet = async () => {
    onClose();
    await disconnect();
    await open({ view: "Connect", namespace: hederaNamespace });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-limit-title"
      className="modal modal-open"
      onKeyDown={event => event.key === "Escape" && onClose()}
    >
      <div className="modal-box flex flex-col gap-3">
        <h3 id="wallet-limit-title" className="m-0 text-base font-semibold">
          {WALLET_LIMIT_COPY.title}
        </h3>
        <p className="m-0 text-sm">{WALLET_LIMIT_COPY[action]}</p>
        <div className="modal-action mt-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {WALLET_LIMIT_COPY.close}
          </button>
          <button ref={primaryButton} type="button" className="btn btn-primary btn-sm" onClick={useAnotherWallet}>
            {WALLET_LIMIT_COPY.useAnotherWallet}
          </button>
        </div>
      </div>
      <button type="button" className="modal-backdrop" aria-label={WALLET_LIMIT_COPY.close} onClick={onClose} />
    </div>
  );
};
