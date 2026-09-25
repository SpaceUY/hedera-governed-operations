import { MutationError } from "./MutationError";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WALLET_REJECTED_MESSAGE } from "~~/services/web3/hederaSigner";

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

  it("shows the message of any other failure", () => {
    render(<MutationError error={new Error("INSUFFICIENT_GAS")} />);
    expect(screen.getByRole("alert").textContent).toBe("Transaction failed: INSUFFICIENT_GAS");
  });
});
