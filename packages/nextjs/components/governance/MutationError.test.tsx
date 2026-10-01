import { MutationError } from "./MutationError";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  TransactionExpiredError,
  WALLET_REJECTED_MESSAGE,
  WalletRejectedError,
  WalletRequestExpiredError,
} from "~~/services/web3/hederaSigner";

afterEach(cleanup);

describe("MutationError", () => {
  it("renders nothing without an error", () => {
    const { container } = render(<MutationError error={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("says the wallet rejected, for an EIP-1193 rejection", () => {
    render(<MutationError error={{ code: 4001, message: "User rejected" }} />);
    expect(screen.getByRole("alert").textContent).toBe(WALLET_REJECTED_MESSAGE);
  });

  it("says the wallet rejected, for a rejection the HashPack signer already mapped", () => {
    render(<MutationError error={new WalletRejectedError()} />);
    expect(screen.getByRole("alert").textContent).toBe(WALLET_REJECTED_MESSAGE);
  });

  it("shows the message of any other failure", () => {
    render(<MutationError error={new Error("network unreachable")} />);
    expect(screen.getByRole("alert").textContent).toBe("Transaction failed: network unreachable");
  });

  it("says the fee was charged and retrying is safe, for INSUFFICIENT_GAS", () => {
    render(<MutationError error={new Error("receipt for transaction ... contained error status INSUFFICIENT_GAS")} />);
    expect(screen.getByRole("alert").textContent).toMatch(/charged the full fee.*retrying is safe/);
  });

  it("says the approval took too long and the transaction was not sent, with the window to approve within", () => {
    render(<MutationError error={new TransactionExpiredError(120)} />);
    expect(screen.getByRole("alert").textContent).toBe(
      "The approval took too long and the transaction expired. This transaction was not sent. " +
        "Try again and approve it in the wallet within about 2 minutes.",
    );
  });

  it("asks to reject a request the app stopped waiting for in the wallet before trying again", () => {
    render(<MutationError error={new WalletRequestExpiredError(120)} />);
    expect(screen.getByRole("alert").textContent).toBe(
      "The request expired before it was approved. This transaction was not sent. " +
        "Reject it in your wallet, then try again and approve within about 2 minutes.",
    );
  });

  it("stays generic for a failure it cannot read", () => {
    render(<MutationError error={{ code: 9000, message: "Unknown Error" }} />);
    expect(screen.getByRole("alert").textContent).toBe("Transaction failed: unknown error");
  });
});
