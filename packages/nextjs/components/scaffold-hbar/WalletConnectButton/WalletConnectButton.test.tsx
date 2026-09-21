import { WalletConnectButton } from "./index";
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
    accountId: null,
    isConnected: false,
    isInitializing: false,
    isBusy: false,
    signerKind: "hashpack",
    disconnect: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as ReturnType<typeof useHederaSigner>;

const connected = (overrides: Partial<ReturnType<typeof useHederaSigner>> = {}) =>
  signerState({ accountId: ACCOUNT_ID, isConnected: true, ...overrides });

describe("WalletConnectButton", () => {
  const open = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    open.mockClear();
    mockedUseAppKit.mockReturnValue({ open } as unknown as ReturnType<typeof useAppKit>);
  });

  it("opens HashPack through AppKit when nothing is connected", () => {
    mockedUseHederaSigner.mockReturnValue(signerState({}));
    render(<WalletConnectButton />);

    fireEvent.click(screen.getByRole("button", { name: "Connect Wallet" }));

    expect(open).toHaveBeenCalledWith({ view: "Connect", namespace: hederaNamespace });
  });

  it("shows the full account id of a HashPack session without a badge", () => {
    mockedUseHederaSigner.mockReturnValue(connected());

    render(<WalletConnectButton />);

    expect(screen.getByText(ACCOUNT_ID)).toBeDefined();
    expect(screen.queryByText("test signer")).toBeNull();
  });

  it("shows the account id and a test signer badge when the burner is active", () => {
    mockedUseHederaSigner.mockReturnValue(connected({ signerKind: "burner" }));

    render(<WalletConnectButton />);

    expect(screen.getByText(ACCOUNT_ID)).toBeDefined();
    expect(screen.getByText("test signer")).toBeDefined();
  });

  it("disconnects through the signer hook", async () => {
    const state = connected({ signerKind: "burner" });
    mockedUseHederaSigner.mockReturnValue(state);
    render(<WalletConnectButton />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    });

    expect(state.disconnect).toHaveBeenCalledTimes(1);
  });
});
