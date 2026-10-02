import {
  type HederaSignerSession,
  TransactionExpiredError,
  WalletRejectedError,
  executeTransaction,
  isTransactionExpired,
  isWalletRejection,
  signTransaction,
  validityWindowLabel,
} from "./hederaSigner";
import type { HederaProvider } from "@hashgraph/hedera-wallet-connect";
import { Hbar, Transaction, TransactionId, TransferTransaction } from "@hiero-ledger/sdk";
import { type Mock, describe, expect, it, vi } from "vitest";
import { base64StringToTransaction } from "~~/utils/scaffold-hbar/hederaTxUtils";

const ACCOUNT_ID = "0.0.1234";
const WALLET_CONNECT_USER_REJECTED = { code: 5000, message: "User rejected." };
const HASHPACK_USER_REJECTED = { code: 9000, message: "USER_REJECT" };
// What a wallet relays when the node refused the transaction at precheck (HIP-820: status code in `data`).
const WALLET_PRECHECK_EXPIRED = {
  code: 9000,
  message: `transaction ${ACCOUNT_ID}@1.0 failed precheck with status TRANSACTION_EXPIRED`,
  data: "4",
};

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

describe("executeTransaction", () => {
  it("returns the transaction id reported by the wallet", async () => {
    const provider = createProviderMock();

    const result = await executeTransaction(createSession(provider), createTransfer());

    expect(result).toEqual({ transactionId: `${ACCOUNT_ID}@1.0` });
  });

  it("freezes the transaction with network node ids before handing it to the wallet", async () => {
    const provider = createProviderMock();
    const tx = createTransfer();

    await executeTransaction(createSession(provider), tx);

    expect(tx.isFrozen()).toBe(true);
    expect(tx.nodeAccountIds?.length).toBeGreaterThan(0);
  });

  it("sends the base64 transaction list signed by the CAIP account of the session network", async () => {
    const provider = createProviderMock();

    await executeTransaction(createSession(provider), createTransfer());

    const [params] = provider.hedera_signAndExecuteTransaction.mock.calls[0];
    expect(params.signerAccountId).toBe(`hedera:testnet:${ACCOUNT_ID}`);
    expect(base64StringToTransaction(params.transactionList)).toBeInstanceOf(Transaction);
  });

  it("pays the transaction with the connected account when no transaction id was set", async () => {
    const provider = createProviderMock();
    const tx = createTransfer();

    await executeTransaction(createSession(provider), tx);

    expect(tx.transactionId?.accountId?.toString()).toBe(ACCOUNT_ID);
  });

  it("keeps a transaction id that was set explicitly", async () => {
    const provider = createProviderMock();
    const tx = createTransfer();
    const explicitId = TransactionId.generate("0.0.999");
    tx.setTransactionId(explicitId);

    await executeTransaction(createSession(provider), tx);

    expect(tx.transactionId?.toString()).toBe(explicitId.toString());
  });

  it("rejects when the wallet returns no transaction id", async () => {
    const provider = createProviderMock();
    provider.hedera_signAndExecuteTransaction.mockResolvedValue({});

    await expect(executeTransaction(createSession(provider), createTransfer())).rejects.toThrow(
      "No transactionId returned from wallet",
    );
  });

  it("maps a WalletConnect user rejection to WalletRejectedError", async () => {
    const provider = createProviderMock();
    provider.hedera_signAndExecuteTransaction.mockRejectedValue(WALLET_CONNECT_USER_REJECTED);

    await expect(executeTransaction(createSession(provider), createTransfer())).rejects.toBeInstanceOf(
      WalletRejectedError,
    );
  });

  it("maps a transaction the node refused as expired to TransactionExpiredError, with its valid duration", async () => {
    const provider = createProviderMock();
    provider.hedera_signAndExecuteTransaction.mockRejectedValue(WALLET_PRECHECK_EXPIRED);

    const error = await executeTransaction(
      createSession(provider),
      createTransfer().setTransactionValidDuration(90),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TransactionExpiredError);
    expect((error as TransactionExpiredError).validForSeconds).toBe(90);
  });

  it("passes other wallet errors through unchanged", async () => {
    const provider = createProviderMock();
    const walletError = new Error("INSUFFICIENT_PAYER_BALANCE");
    provider.hedera_signAndExecuteTransaction.mockRejectedValue(walletError);

    await expect(executeTransaction(createSession(provider), createTransfer())).rejects.toBe(walletError);
  });
});

describe("signTransaction", () => {
  it("signs without executing", async () => {
    const provider = createProviderMock();

    await signTransaction(createSession(provider), createTransfer());

    expect(provider.hedera_signAndExecuteTransaction).not.toHaveBeenCalled();
  });

  it("asks the wallet to sign the frozen transaction for the session account", async () => {
    const provider = createProviderMock();
    const tx = createTransfer();

    await signTransaction(createSession(provider), tx);

    const [params] = provider.hedera_signTransaction.mock.calls[0];
    expect(params).toEqual({ signerAccountId: `hedera:testnet:${ACCOUNT_ID}`, transactionBody: tx });
  });

  it("returns an SDK transaction carrying the original transaction id", async () => {
    const provider = createProviderMock();
    const tx = createTransfer();

    const signed = await signTransaction(createSession(provider), tx);

    expect(signed).toBeInstanceOf(Transaction);
    expect(signed.transactionId?.toString()).toBe(tx.transactionId?.toString());
  });

  it("maps a HashPack user rejection to WalletRejectedError", async () => {
    const provider = createProviderMock();
    provider.hedera_signTransaction.mockRejectedValue(HASHPACK_USER_REJECTED);

    await expect(signTransaction(createSession(provider), createTransfer())).rejects.toBeInstanceOf(
      WalletRejectedError,
    );
  });
});

describe("isWalletRejection", () => {
  it.each([
    ["WalletConnect USER_REJECTED", WALLET_CONNECT_USER_REJECTED],
    ["WalletConnect USER_REJECTED_METHODS", { code: 5002, message: "User rejected methods." }],
    ["EIP-1193 user rejected request", { code: 4001, message: "User rejected the request." }],
    ["HashPack USER_REJECT", HASHPACK_USER_REJECTED],
    ["Error whose message mentions the rejection", new Error("Request rejected by user")],
    ["the rejection this module maps a wallet's answer to", new WalletRejectedError()],
  ])("recognises %s", (_label, error) => {
    expect(isWalletRejection(error)).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "User rejected."],
    ["an unrelated error", new Error("INSUFFICIENT_PAYER_BALANCE")],
    ["an unrelated code", { code: 9000, message: "INVALID_PARAMS" }],
  ])("ignores %s", (_label, error) => {
    expect(isWalletRejection(error)).toBe(false);
  });
});

describe("isTransactionExpired", () => {
  it.each([
    ["a wallet's HIP-820 precheck error", WALLET_PRECHECK_EXPIRED],
    ["the status code alone", { code: 9000, message: "Unknown Error", data: "4" }],
    ["the SDK's precheck error", new Error("transaction 0.0.1@1.0 failed precheck with status TRANSACTION_EXPIRED")],
  ])("recognises %s", (_label, error) => {
    expect(isTransactionExpired(error)).toBe(true);
  });

  it.each([
    ["null", null],
    ["a rejection", HASHPACK_USER_REJECTED],
    ["another precheck status", { code: 9000, message: "failed precheck with status INVALID_SIGNATURE", data: "7" }],
    ["a status code of 4 under another error code", { code: 5000, message: "User rejected.", data: "4" }],
  ])("ignores %s", (_label, error) => {
    expect(isTransactionExpired(error)).toBe(false);
  });
});

describe("validityWindowLabel", () => {
  it("rounds a deadline down to whole minutes from two minutes up, and keeps seconds below", () => {
    expect(validityWindowLabel(120)).toBe("about 2 minutes");
    expect(validityWindowLabel(180)).toBe("about 3 minutes");
    expect(validityWindowLabel(170)).toBe("about 2 minutes");
    expect(validityWindowLabel(90)).toBe("90 seconds");
  });
});
