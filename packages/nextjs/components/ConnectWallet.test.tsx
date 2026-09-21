import { ConnectWallet } from "./ConnectWallet";
import { hederaNamespace } from "@hashgraph/hedera-wallet-connect";
import { useAppKit } from "@reown/appkit/react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHederaSigner } from "~~/hooks/useHederaSigner";

vi.mock("@reown/appkit/react", () => ({ useAppKit: vi.fn() }));
vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: vi.fn() }));

const ACCOUNT_ID = "0.0.1234";
const mockedUseAppKit = vi.mocked(useAppKit);
const mockedUseHederaSigner = vi.mocked(useHederaSigner);

const signerState = (overrides: Partial<ReturnType<typeof useHederaSigner>>) =>
  ({
    provider: null,
    accountId: null,
    isConnected: false,
    isInitializing: false,
    isBusy: false,
    signerKind: "hashpack",
    requireProvider: vi.fn(),
    requireAccountId: vi.fn(),
    requireSigner: vi.fn(),
    executeTransaction: vi.fn(),
    signTransaction: vi.fn(),
    disconnect: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as ReturnType<typeof useHederaSigner>;

const connectButton = () => screen.getByRole<HTMLButtonElement>("button", { name: "Connect wallet" });
const disconnectButton = () => screen.getByRole<HTMLButtonElement>("button", { name: /^Disconnect/ });

const connected = (overrides: Partial<ReturnType<typeof useHederaSigner>> = {}) =>
  signerState({ accountId: ACCOUNT_ID, isConnected: true, ...overrides });

describe("ConnectWallet", () => {
  const open = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    open.mockClear();
    mockedUseAppKit.mockReturnValue({ open } as unknown as ReturnType<typeof useAppKit>);
  });

  describe("without a session", () => {
    it("offers to connect", () => {
      mockedUseHederaSigner.mockReturnValue(signerState({}));

      render(<ConnectWallet />);

      expect(connectButton().disabled).toBe(false);
    });

    it("opens the AppKit modal on the Hedera namespace", async () => {
      mockedUseHederaSigner.mockReturnValue(signerState({}));
      render(<ConnectWallet />);

      await act(async () => {
        fireEvent.click(connectButton());
      });

      expect(open).toHaveBeenCalledWith({ view: "Connect", namespace: hederaNamespace });
    });

    it("is disabled while the wallet is initializing", () => {
      mockedUseHederaSigner.mockReturnValue(signerState({ isInitializing: true }));

      render(<ConnectWallet />);

      expect(connectButton().disabled).toBe(true);
    });

    it("shows a friendly message when the user rejects the connection", async () => {
      open.mockRejectedValueOnce({ code: 5000, message: "User rejected." });
      mockedUseHederaSigner.mockReturnValue(signerState({}));
      render(<ConnectWallet />);

      await act(async () => {
        fireEvent.click(connectButton());
      });

      expect(screen.getByRole("alert").textContent).toBe("Request rejected in the wallet.");
    });

    it("shows a generic message for other wallet failures", async () => {
      open.mockRejectedValueOnce(new Error("relay unreachable"));
      mockedUseHederaSigner.mockReturnValue(signerState({}));
      render(<ConnectWallet />);

      await act(async () => {
        fireEvent.click(connectButton());
      });

      expect(screen.getByRole("alert").textContent).toBe("Wallet action failed. Try again.");
    });
  });

  describe("with a session", () => {
    it("shows the connected account id", () => {
      mockedUseHederaSigner.mockReturnValue(connected());

      render(<ConnectWallet />);

      expect(screen.getByText(ACCOUNT_ID)).toBeDefined();
    });

    it("does not label a HashPack session as the test signer", () => {
      mockedUseHederaSigner.mockReturnValue(connected());

      render(<ConnectWallet />);

      expect(screen.queryByText("test signer")).toBeNull();
    });

    it("labels the account when the test signer is active", () => {
      mockedUseHederaSigner.mockReturnValue(connected({ signerKind: "burner" }));

      render(<ConnectWallet />);

      expect(screen.getByText("test signer")).toBeDefined();
    });

    it("disconnects through the signer hook", async () => {
      const state = connected();
      mockedUseHederaSigner.mockReturnValue(state);
      render(<ConnectWallet />);

      await act(async () => {
        fireEvent.click(disconnectButton());
      });

      expect(state.disconnect).toHaveBeenCalledTimes(1);
    });

    it("is disabled while the wallet is busy", () => {
      mockedUseHederaSigner.mockReturnValue(connected({ isBusy: true }));

      render(<ConnectWallet />);

      expect(disconnectButton().disabled).toBe(true);
    });
  });
});
