// @vitest-environment node
import {
  BURNER_PRIVATE_KEY_STORAGE_KEY,
  BurnerKeyError,
  createBurnerSigner,
  readBurnerPrivateKey,
  resolveBurnerAccountId,
} from "./burnerSigner";
import { Client, Hbar, PrivateKey, TopicCreateTransaction, TransferTransaction } from "@hiero-ledger/sdk";
import { MirrorNodeError, fetchAccount } from "@sh/core/mirror";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@sh/core/mirror", async importOriginal => ({
  ...(await importOriginal<typeof import("@sh/core/mirror")>()),
  fetchAccount: vi.fn(),
}));

const ACCOUNT_ID = "0.0.4321";
const privateKey = PrivateKey.generateECDSA();
const mockedFetchAccount = vi.mocked(fetchAccount);

const notFound = () => new MirrorNodeError(404, "https://testnet.mirrornode.hedera.com/api/v1/accounts/0x0", "{}");

const storageWith = (value: string | null) => ({
  getItem: (key: string) => (key === BURNER_PRIVATE_KEY_STORAGE_KEY ? value : null),
});

describe("readBurnerPrivateKey", () => {
  it("returns null when no key is stored", () => {
    expect(readBurnerPrivateKey(storageWith(null))).toBeNull();
  });

  it("parses a raw hex ECDSA key", () => {
    expect(readBurnerPrivateKey(storageWith(privateKey.toStringRaw()))?.toStringRaw()).toBe(privateKey.toStringRaw());
  });

  it("parses a 0x-prefixed hex key", () => {
    expect(readBurnerPrivateKey(storageWith(`0x${privateKey.toStringRaw()}`))?.toStringRaw()).toBe(
      privateKey.toStringRaw(),
    );
  });

  it("throws BurnerKeyError on a malformed key without echoing it", () => {
    expect(() => readBurnerPrivateKey(storageWith("not-a-key"))).toThrow(BurnerKeyError);
    expect(() => readBurnerPrivateKey(storageWith("not-a-key"))).not.toThrow(/not-a-key/);
  });
});

describe("resolveBurnerAccountId", () => {
  afterEach(() => {
    mockedFetchAccount.mockReset();
  });

  it("looks the account up by the key's EVM alias", async () => {
    mockedFetchAccount.mockResolvedValue({ account: ACCOUNT_ID } as Awaited<ReturnType<typeof fetchAccount>>);

    const accountId = await resolveBurnerAccountId(privateKey.publicKey, "testnet", { retryDelaysMs: [] });

    expect(accountId).toBe(ACCOUNT_ID);
    expect(mockedFetchAccount).toHaveBeenCalledWith(`0x${privateKey.publicKey.toEvmAddress()}`, {
      network: "testnet",
    });
  });

  it("retries while the Mirror Node has not indexed the account yet", async () => {
    mockedFetchAccount
      .mockRejectedValueOnce(notFound())
      .mockResolvedValueOnce({ account: ACCOUNT_ID } as Awaited<ReturnType<typeof fetchAccount>>);

    const accountId = await resolveBurnerAccountId(privateKey.publicKey, "testnet", { retryDelaysMs: [0] });

    expect(accountId).toBe(ACCOUNT_ID);
  });

  it("gives up after the last retry with a clear error", async () => {
    mockedFetchAccount.mockRejectedValue(notFound());

    await expect(resolveBurnerAccountId(privateKey.publicKey, "testnet", { retryDelaysMs: [0, 0] })).rejects.toThrow(
      /not found on testnet/,
    );
    expect(mockedFetchAccount).toHaveBeenCalledTimes(3);
  });

  it("does not retry on errors other than 404", async () => {
    mockedFetchAccount.mockRejectedValue(new MirrorNodeError(500, "url", "boom"));

    await expect(
      resolveBurnerAccountId(privateKey.publicKey, "testnet", { retryDelaysMs: [0] }),
    ).rejects.toBeInstanceOf(MirrorNodeError);
    expect(mockedFetchAccount).toHaveBeenCalledTimes(1);
  });
});

describe("createBurnerSigner", () => {
  const client = Client.forTestnet({ scheduleNetworkUpdate: false });
  const signer = createBurnerSigner({ privateKey, accountId: ACCOUNT_ID, network: "testnet", client });

  const createTransfer = () =>
    new TransferTransaction()
      .addHbarTransfer(ACCOUNT_ID, Hbar.fromTinybars(-1))
      .addHbarTransfer("0.0.98", Hbar.fromTinybars(1));

  it("binds the burner account as the client's operator", () => {
    expect(client.operatorAccountId?.toString()).toBe(ACCOUNT_ID);
    expect(client.operatorPublicKey?.toStringRaw()).toBe(privateKey.publicKey.toStringRaw());
  });

  it("describes itself as the burner for the resolved account", () => {
    expect(signer).toMatchObject({ kind: "burner", accountId: ACCOUNT_ID, network: "testnet" });
    expect(signer.publicKey.toStringRaw()).toBe(privateKey.publicKey.toStringRaw());
  });

  it("executeTransaction freezes, executes with the client and waits for the receipt", async () => {
    const tx = new TopicCreateTransaction();
    const getReceipt = vi.fn().mockResolvedValue({});
    const execute = vi
      .spyOn(tx, "execute")
      .mockImplementation(
        async () => ({ transactionId: { toString: () => `${ACCOUNT_ID}@1.0` }, getReceipt }) as never,
      );

    const executed = await signer.executeTransaction(tx);

    expect(executed).toEqual({ transactionId: `${ACCOUNT_ID}@1.0` });
    expect(tx.isFrozen()).toBe(true);
    expect(execute).toHaveBeenCalledWith(client);
    expect(getReceipt).toHaveBeenCalledWith(client);
  });

  it("executeTransaction pays with the burner account", async () => {
    const tx = new TopicCreateTransaction();
    vi.spyOn(tx, "execute").mockImplementation(
      async () => ({ transactionId: { toString: () => "id" }, getReceipt: async () => ({}) }) as never,
    );

    await signer.executeTransaction(tx);

    expect(tx.transactionId?.accountId?.toString()).toBe(ACCOUNT_ID);
  });

  it("signTransaction returns the frozen transaction signed by the burner key", async () => {
    const signed = await signer.signTransaction(createTransfer());

    expect(signed.isFrozen()).toBe(true);
    expect(signed.getSignatures().size).toBeGreaterThan(0);
  });
});
