"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  BURNER_PRIVATE_KEY_STORAGE_KEY,
  type BurnerSigner,
  createBurnerSigner,
  readBurnerPrivateKey,
  resolveBurnerAccountId,
} from "./burnerSigner";
import { resolveBurnerAvailability } from "./burnerSignerPolicy";
import { Client, type PrivateKey } from "@hiero-ledger/sdk";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { getHederaNetworkNameFromChainId } from "~~/utils/scaffold-hbar";
import type { HederaNetworkName } from "~~/utils/scaffold-hbar/networks";

type BurnerSignerState =
  | { status: "inactive"; signer: null; error: null }
  | { status: "resolving"; signer: null; error: null }
  | { status: "ready"; signer: BurnerSigner; error: null }
  | { status: "error"; signer: null; error: Error };

type BurnerSignerContextValue = BurnerSignerState & {
  /** Forgets the stored key so the app falls back to HashPack. */
  deactivate: () => void;
};

const INACTIVE: BurnerSignerState = { status: "inactive", signer: null, error: null };
const RESOLVING: BurnerSignerState = { status: "resolving", signer: null, error: null };

const BurnerSignerContext = createContext<BurnerSignerContextValue | undefined>(undefined);

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

function readAllowedBurnerKey(network: HederaNetworkName): PrivateKey | null {
  const privateKey = readBurnerPrivateKey(window.localStorage);
  if (!privateKey) return null;
  const availability = resolveBurnerAvailability({
    network,
    nodeEnv: process.env.NODE_ENV,
    enableFlag: process.env.NEXT_PUBLIC_ENABLE_BURNER_SIGNER,
  });
  if (availability.allowed) return privateKey;
  console.warn(`Ignoring the test signer key in localStorage: ${availability.reason}`);
  return null;
}

/**
 * Activates the ephemeral test signer when a key is present in `localStorage` (see
 * `BURNER_PRIVATE_KEY_STORAGE_KEY`), so the app connects on reload without a wallet modal.
 */
export const BurnerSignerProvider = ({ children }: { children: ReactNode }) => {
  const { targetNetwork } = useTargetNetwork();
  const network = getHederaNetworkNameFromChainId(targetNetwork.id);
  const [state, setState] = useState<BurnerSignerState>(INACTIVE);

  useEffect(() => {
    let privateKey: PrivateKey | null;
    try {
      privateKey = readAllowedBurnerKey(network);
    } catch (error) {
      setState({ status: "error", signer: null, error: toError(error) });
      return;
    }
    if (!privateKey) {
      setState(INACTIVE);
      return;
    }

    let cancelled = false;
    const client = Client.forTestnet({ scheduleNetworkUpdate: false });
    setState(RESOLVING);
    resolveBurnerAccountId(privateKey.publicKey, network)
      .then(accountId => {
        if (cancelled) return;
        setState({
          status: "ready",
          signer: createBurnerSigner({ privateKey, accountId, network, client }),
          error: null,
        });
      })
      .catch(error => {
        if (!cancelled) setState({ status: "error", signer: null, error: toError(error) });
      });
    return () => {
      cancelled = true;
      client.close();
    };
  }, [network]);

  const deactivate = useCallback(() => {
    window.localStorage.removeItem(BURNER_PRIVATE_KEY_STORAGE_KEY);
    setState(INACTIVE);
  }, []);

  const value = useMemo<BurnerSignerContextValue>(() => ({ ...state, deactivate }), [state, deactivate]);

  return <BurnerSignerContext.Provider value={value}>{children}</BurnerSignerContext.Provider>;
};

export const useBurnerSigner = () => {
  const ctx = useContext(BurnerSignerContext);
  if (!ctx) throw new Error("useBurnerSigner must be used inside BurnerSignerProvider");
  return ctx;
};
