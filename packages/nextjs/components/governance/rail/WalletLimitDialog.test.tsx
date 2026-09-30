import { WalletLimitDialog } from "./WalletLimitDialog";
import { hederaNamespace } from "@hashgraph/hedera-wallet-connect";
import { useAppKit } from "@reown/appkit/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHederaSigner } from "~~/hooks/useHederaSigner";

vi.mock("@reown/appkit/react", () => ({ useAppKit: vi.fn() }));
vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: vi.fn() }));

const open = vi.fn().mockResolvedValue(undefined);
const disconnect = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  open.mockClear();
  disconnect.mockClear();
  vi.mocked(useAppKit).mockReturnValue({ open } as unknown as ReturnType<typeof useAppKit>);
  vi.mocked(useHederaSigner).mockReturnValue({ disconnect } as unknown as ReturnType<typeof useHederaSigner>);
});

afterEach(cleanup);

describe("WalletLimitDialog", () => {
  it("renders nothing without an action", () => {
    render(<WalletLimitDialog action={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("names the step the wallet cannot sign and a wallet that can", () => {
    render(<WalletLimitDialog action="withdraw" onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "HashPack cannot sign this step" }).textContent).toMatch(
      /such as Kabila/,
    );
  });

  it("puts focus on the way out", () => {
    render(<WalletLimitDialog action="cancelLive" onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Use another wallet" }));
  });

  it("disconnects this wallet and opens the wallet chooser", async () => {
    const onClose = vi.fn();
    render(<WalletLimitDialog action="withdraw" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Use another wallet" }));
    await waitFor(() => expect(open).toHaveBeenCalledWith({ view: "Connect", namespace: hederaNamespace }));
    expect(disconnect).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<WalletLimitDialog action="withdraw" onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
