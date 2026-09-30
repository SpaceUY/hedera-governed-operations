import { useHederaSigner } from "./useHederaSigner";
import type { HederaProvider } from "@hashgraph/hedera-wallet-connect";
import { Hbar, Transaction, TransferTransaction } from "@hiero-ledger/sdk";
import { renderHook } from "@testing-library/react";
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";
import { useBurnerSigner } from "~~/services/web3/BurnerSignerProvider";
import type { BurnerSigner } from "~~/services/web3/burnerSigner";
import { WalletRejectedError } from "~~/services/web3/hederaSigner";
import { useHederaWalletConnect } from "~~/services/web3/hederaWalletConnect";

vi.mock("~~/services/web3/hederaWalletConnect", () => ({ useHederaWalletConnect: vi.fn() }));
vi.mock("~~/services/web3/BurnerSignerProvider", () => ({ useBurnerSigner: vi.fn() }));

const ACCOUNT_ID = "0.0.1234";
const BURNER_ACCOUNT_ID = "0.0.9999";
const mockedUseHederaWalletConnect = vi.mocked(useHederaWalletConnect);
const mockedUseBurnerSigner = vi.mocked(useBurnerSigner);

type BurnerState = ReturnType<typeof useBurnerSigner>;

const burnerInactive = (): BurnerState => ({ status: "inactive", signer: null, error: null, deactivate: vi.fn() });

const createBurnerSignerMock = () =>
  ({
    kind: "burner",
    accountId: BURNER_ACCOUNT_ID,
    network: "testnet",
    executeTransaction: vi.fn().mockResolvedValue({ transactionId: `${BURNER_ACCOUNT_ID}@1.0` }),
    signTransaction: vi.fn().mockImplementation(async (tx: Transaction) => tx),
  }) as unknown as BurnerSigner;

const burnerReady = (signer: BurnerSigner): BurnerState => ({
  status: "ready",
  signer,
  error: null,
  deactivate: vi.fn(),
});

type ProviderMock = {
  hedera_signAndExecuteTransaction: Mock;
  hedera_signTransaction: Mock;
};

const createProviderMock = (): ProviderMock => ({
  hedera_signAndExecuteTransaction: vi.fn().mockResolvedValue({ transactionId: `${ACCOUNT_ID}@1.0` }),
  hedera_signTransaction: vi.fn().mockImplementation(async ({ transactionBody }) => transactionBody),
});

const createTransfer = () =>
  new TransferTransaction()
    .addHbarTransfer(ACCOUNT_ID, Hbar.fromTinybars(-1))
    .addHbarTransfer(ACCOUNT_ID, Hbar.fromTinybars(1));

const walletState = (overrides: Partial<ReturnType<typeof useHederaWalletConnect>>) => ({
  provider: null,
  accountId: null,
  walletName: null,
  isConnected: false,
  isInitializing: false,
  isBusy: false,
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const connectedWith = (provider: ProviderMock, walletName: string | null = null) =>
  walletState({
    provider: provider as unknown as HederaProvider,
    accountId: ACCOUNT_ID,
    walletName,
    isConnected: true,
  });

describe("useHederaSigner", () => {
  beforeEach(() => {
    mockedUseHederaWalletConnect.mockReset();
    mockedUseBurnerSigner.mockReturnValue(burnerInactive());
  });

  describe("when disconnected", () => {
    beforeEach(() => {
      mockedUseHederaWalletConnect.mockReturnValue(walletState({}));
    });

    it("requireAccountId throws", () => {
      const { result } = renderHook(() => useHederaSigner());

      expect(() => result.current.requireAccountId()).toThrow("Connect a Hedera wallet first");
    });

    it("exposes no signer", () => {
      const { result } = renderHook(() => useHederaSigner());

      expect(result.current).toMatchObject({ accountId: null, isConnected: false, walletName: null });
      expect("provider" in result.current).toBe(false);
    });

    it("executeTransaction rejects without reaching a provider", async () => {
      const { result } = renderHook(() => useHederaSigner());

      await expect(result.current.executeTransaction(createTransfer())).rejects.toThrow(
        "Connect a Hedera wallet first",
      );
    });

    it("signTransaction rejects without reaching a provider", async () => {
      const { result } = renderHook(() => useHederaSigner());

      await expect(result.current.signTransaction(createTransfer())).rejects.toThrow("Connect a Hedera wallet first");
    });
  });

  describe("when connected", () => {
    it("keeps the existing connection API", () => {
      const provider = createProviderMock();
      mockedUseHederaWalletConnect.mockReturnValue(connectedWith(provider));

      const { result } = renderHook(() => useHederaSigner());

      expect(result.current).toMatchObject({
        accountId: ACCOUNT_ID,
        isConnected: true,
        isInitializing: false,
        signerKind: "hashpack",
      });
      expect(result.current.requireAccountId()).toBe(ACCOUNT_ID);
      expect(result.current.requireSigner()).toMatchObject({ kind: "hashpack", accountId: ACCOUNT_ID });
    });

    it("executeTransaction signs and executes with the connected account on the target network", async () => {
      const provider = createProviderMock();
      mockedUseHederaWalletConnect.mockReturnValue(connectedWith(provider));
      const { result } = renderHook(() => useHederaSigner());

      const executed = await result.current.executeTransaction(createTransfer());

      expect(executed).toEqual({ transactionId: `${ACCOUNT_ID}@1.0` });
      expect(provider.hedera_signAndExecuteTransaction.mock.calls[0][0].signerAccountId).toBe(
        `hedera:testnet:${ACCOUNT_ID}`,
      );
    });

    it("signTransaction returns the signed transaction without executing", async () => {
      const provider = createProviderMock();
      mockedUseHederaWalletConnect.mockReturnValue(connectedWith(provider));
      const { result } = renderHook(() => useHederaSigner());

      const signed = await result.current.signTransaction(createTransfer());

      expect(signed).toBeInstanceOf(Transaction);
      expect(provider.hedera_signAndExecuteTransaction).not.toHaveBeenCalled();
    });

    it("surfaces a wallet rejection as WalletRejectedError", async () => {
      const provider = createProviderMock();
      provider.hedera_signAndExecuteTransaction.mockRejectedValue({ code: 5000, message: "User rejected." });
      mockedUseHederaWalletConnect.mockReturnValue(connectedWith(provider));
      const { result } = renderHook(() => useHederaSigner());

      await expect(result.current.executeTransaction(createTransfer())).rejects.toBeInstanceOf(WalletRejectedError);
    });

    it("says which WalletConnect wallet is connected", () => {
      mockedUseHederaWalletConnect.mockReturnValue(connectedWith(createProviderMock(), "HashPack"));

      const { result } = renderHook(() => useHederaSigner());

      expect(result.current).toMatchObject({ signerKind: "hashpack", walletName: "HashPack" });
    });

    it("disconnect delegates to the wallet provider", async () => {
      const state = connectedWith(createProviderMock());
      mockedUseHederaWalletConnect.mockReturnValue(state);
      const { result } = renderHook(() => useHederaSigner());

      await result.current.disconnect();

      expect(state.disconnectWallet).toHaveBeenCalledTimes(1);
    });
  });

  describe("with the test signer active", () => {
    it("reports the burner as connected without a wallet session", () => {
      mockedUseHederaWalletConnect.mockReturnValue(walletState({}));
      mockedUseBurnerSigner.mockReturnValue(burnerReady(createBurnerSignerMock()));

      const { result } = renderHook(() => useHederaSigner());

      expect(result.current).toMatchObject({
        accountId: BURNER_ACCOUNT_ID,
        isConnected: true,
        signerKind: "burner",
      });
      expect(result.current.requireAccountId()).toBe(BURNER_ACCOUNT_ID);
    });

    it("takes precedence over a connected wallet", () => {
      mockedUseHederaWalletConnect.mockReturnValue(connectedWith(createProviderMock()));
      mockedUseBurnerSigner.mockReturnValue(burnerReady(createBurnerSignerMock()));

      const { result } = renderHook(() => useHederaSigner());

      expect(result.current.accountId).toBe(BURNER_ACCOUNT_ID);
    });

    it("has no wallet name, even with a wallet session open underneath", () => {
      mockedUseHederaWalletConnect.mockReturnValue(connectedWith(createProviderMock(), "HashPack"));
      mockedUseBurnerSigner.mockReturnValue(burnerReady(createBurnerSignerMock()));

      const { result } = renderHook(() => useHederaSigner());

      expect(result.current.walletName).toBeNull();
    });

    it("executeTransaction signs with the burner and never reaches the wallet", async () => {
      const provider = createProviderMock();
      const burner = createBurnerSignerMock();
      mockedUseHederaWalletConnect.mockReturnValue(connectedWith(provider));
      mockedUseBurnerSigner.mockReturnValue(burnerReady(burner));
      const { result } = renderHook(() => useHederaSigner());

      const executed = await result.current.executeTransaction(createTransfer());

      expect(executed).toEqual({ transactionId: `${BURNER_ACCOUNT_ID}@1.0` });
      expect(provider.hedera_signAndExecuteTransaction).not.toHaveBeenCalled();
    });

    it("signTransaction delegates to the burner", async () => {
      const burner = createBurnerSignerMock();
      mockedUseHederaWalletConnect.mockReturnValue(walletState({}));
      mockedUseBurnerSigner.mockReturnValue(burnerReady(burner));
      const { result } = renderHook(() => useHederaSigner());
      const tx = createTransfer();

      await result.current.signTransaction(tx);

      expect(burner.signTransaction).toHaveBeenCalledWith(tx);
    });

    it("disconnect deactivates the burner instead of the wallet", async () => {
      const wallet = walletState({});
      const burner = burnerReady(createBurnerSignerMock());
      mockedUseHederaWalletConnect.mockReturnValue(wallet);
      mockedUseBurnerSigner.mockReturnValue(burner);
      const { result } = renderHook(() => useHederaSigner());

      await result.current.disconnect();

      expect(burner.deactivate).toHaveBeenCalledTimes(1);
      expect(wallet.disconnectWallet).not.toHaveBeenCalled();
    });

    it("is initializing while the burner account is being resolved", () => {
      mockedUseHederaWalletConnect.mockReturnValue(walletState({}));
      mockedUseBurnerSigner.mockReturnValue({ status: "resolving", signer: null, error: null, deactivate: vi.fn() });

      const { result } = renderHook(() => useHederaSigner());

      expect(result.current.isInitializing).toBe(true);
      expect(result.current.isConnected).toBe(false);
    });
  });
});
