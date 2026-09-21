import { useHederaSigner } from "./useHederaSigner";
import type { HederaProvider } from "@hashgraph/hedera-wallet-connect";
import { Hbar, Transaction, TransferTransaction } from "@hiero-ledger/sdk";
import { renderHook } from "@testing-library/react";
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";
import { WalletRejectedError } from "~~/services/web3/hederaSigner";
import { useHederaWalletConnect } from "~~/services/web3/hederaWalletConnect";

vi.mock("~~/services/web3/hederaWalletConnect", () => ({ useHederaWalletConnect: vi.fn() }));

const ACCOUNT_ID = "0.0.1234";
const mockedUseHederaWalletConnect = vi.mocked(useHederaWalletConnect);

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
  isConnected: false,
  isInitializing: false,
  isBusy: false,
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const connectedWith = (provider: ProviderMock) =>
  walletState({ provider: provider as unknown as HederaProvider, accountId: ACCOUNT_ID, isConnected: true });

describe("useHederaSigner", () => {
  beforeEach(() => {
    mockedUseHederaWalletConnect.mockReset();
  });

  describe("when disconnected", () => {
    beforeEach(() => {
      mockedUseHederaWalletConnect.mockReturnValue(walletState({}));
    });

    it("requireProvider throws", () => {
      const { result } = renderHook(() => useHederaSigner());

      expect(() => result.current.requireProvider()).toThrow("Connect a Hedera wallet first");
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

      expect(result.current).toMatchObject({ accountId: ACCOUNT_ID, isConnected: true, isInitializing: false });
      expect(result.current.requireProvider()).toEqual({ provider, accountId: ACCOUNT_ID });
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

    it("disconnect delegates to the wallet provider", async () => {
      const state = connectedWith(createProviderMock());
      mockedUseHederaWalletConnect.mockReturnValue(state);
      const { result } = renderHook(() => useHederaSigner());

      await result.current.disconnect();

      expect(state.disconnectWallet).toHaveBeenCalledTimes(1);
    });
  });
});
