import { createHashPackSigner } from "./hashPackSigner";
import type { HederaSignerSession } from "./hederaSigner";
import type { HederaProvider } from "@hashgraph/hedera-wallet-connect";
import { Hbar, Transaction, TransferTransaction } from "@hiero-ledger/sdk";
import { type Mock, describe, expect, it, vi } from "vitest";

const ACCOUNT_ID = "0.0.1234";

type ProviderMock = {
  hedera_signAndExecuteTransaction: Mock;
  hedera_signTransaction: Mock;
};

const createProviderMock = (): ProviderMock => ({
  hedera_signAndExecuteTransaction: vi.fn().mockResolvedValue({ transactionId: `${ACCOUNT_ID}@1.0` }),
  hedera_signTransaction: vi.fn().mockImplementation(async ({ transactionBody }) => transactionBody),
});

const createSession = (provider: ProviderMock): HederaSignerSession => ({
  provider: provider as unknown as HederaProvider,
  accountId: ACCOUNT_ID,
  network: "testnet",
});

const createTransfer = () =>
  new TransferTransaction()
    .addHbarTransfer(ACCOUNT_ID, Hbar.fromTinybars(-1))
    .addHbarTransfer(ACCOUNT_ID, Hbar.fromTinybars(1));

describe("createHashPackSigner", () => {
  it("describes itself as HashPack for the session account", () => {
    const signer = createHashPackSigner(createSession(createProviderMock()));

    expect(signer).toMatchObject({ kind: "hashpack", accountId: ACCOUNT_ID, network: "testnet" });
  });

  it("executeTransaction goes through the wallet session", async () => {
    const provider = createProviderMock();
    const signer = createHashPackSigner(createSession(provider));

    const executed = await signer.executeTransaction(createTransfer());

    expect(executed).toEqual({ transactionId: `${ACCOUNT_ID}@1.0` });
    expect(provider.hedera_signAndExecuteTransaction.mock.calls[0][0].signerAccountId).toBe(
      `hedera:testnet:${ACCOUNT_ID}`,
    );
  });

  it("signTransaction returns a signed transaction without executing", async () => {
    const provider = createProviderMock();
    const signer = createHashPackSigner(createSession(provider));

    const signed = await signer.signTransaction(createTransfer());

    expect(signed).toBeInstanceOf(Transaction);
    expect(provider.hedera_signAndExecuteTransaction).not.toHaveBeenCalled();
  });
});
