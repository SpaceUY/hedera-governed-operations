import { NativeTransactionSignerBridge } from "./NativeTransactionSignerBridge";
import { TopicCreateTransaction } from "@hiero-ledger/sdk";
import { CapabilityError, getNativeTransactionSigner } from "@scaffold-hbar-ui/hooks";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHederaSigner } from "~~/hooks/useHederaSigner";

vi.mock("~~/hooks/useHederaSigner", () => ({ useHederaSigner: vi.fn() }));

const mockedUseHederaSigner = vi.mocked(useHederaSigner);

const signerState = (overrides: Partial<ReturnType<typeof useHederaSigner>>) =>
  ({ isConnected: false, executeTransaction: vi.fn(), ...overrides }) as ReturnType<typeof useHederaSigner>;

const registeredSigner = () => {
  const signer = getNativeTransactionSigner();
  if (!signer) throw new Error("no native signer registered");
  return signer;
};

describe("NativeTransactionSignerBridge", () => {
  afterEach(() => {
    mockedUseHederaSigner.mockReset();
  });

  it("routes native transactions through the active signer", async () => {
    const executeTransaction = vi.fn().mockResolvedValue({ transactionId: "0.0.1@1.0" });
    mockedUseHederaSigner.mockReturnValue(signerState({ isConnected: true, executeTransaction }));
    render(<NativeTransactionSignerBridge>{null}</NativeTransactionSignerBridge>);
    const tx = new TopicCreateTransaction();

    await expect(registeredSigner()(tx)).resolves.toEqual({ transactionId: "0.0.1@1.0" });
    expect(executeTransaction).toHaveBeenCalledWith(tx);
  });

  it("reports a missing signer as a capability error", async () => {
    mockedUseHederaSigner.mockReturnValue(signerState({}));
    render(<NativeTransactionSignerBridge>{null}</NativeTransactionSignerBridge>);

    await expect(registeredSigner()(new TopicCreateTransaction())).rejects.toBeInstanceOf(CapabilityError);
  });

  it("unregisters the signer on unmount", () => {
    mockedUseHederaSigner.mockReturnValue(signerState({}));
    const { unmount } = render(<NativeTransactionSignerBridge>{null}</NativeTransactionSignerBridge>);

    unmount();

    expect(getNativeTransactionSigner()).toBeUndefined();
  });
});
