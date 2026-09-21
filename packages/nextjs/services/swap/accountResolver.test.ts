import { createMirrorNodeAccountResolver } from "./accountResolver";
import { SwapValidationError } from "./errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type MirrorAccount, fetchAccount } from "~~/services/mirror";

vi.mock("~~/services/mirror", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/services/mirror")>()),
  fetchAccount: vi.fn(),
}));

const ACCOUNT_ID = "0.0.8192684";
const ALIAS = "0x8ee63b21d5e7e5f2a4a0a4f2f0cbd6e1a7ac2fd1";
const mockedFetchAccount = vi.mocked(fetchAccount);

const accountWith = (evmAddress: string | null) => ({ account: ACCOUNT_ID, evm_address: evmAddress }) as MirrorAccount;

describe("createMirrorNodeAccountResolver", () => {
  beforeEach(() => {
    mockedFetchAccount.mockReset();
  });

  it("looks the account up on the given network", async () => {
    mockedFetchAccount.mockResolvedValue(accountWith(ALIAS));

    await createMirrorNodeAccountResolver("testnet").evmAddress(ACCOUNT_ID);

    expect(mockedFetchAccount).toHaveBeenCalledWith(ACCOUNT_ID, { network: "testnet" });
  });

  it("returns the address Mirror reports for the account", async () => {
    mockedFetchAccount.mockResolvedValue(accountWith(ALIAS));

    await expect(createMirrorNodeAccountResolver("testnet").evmAddress(ACCOUNT_ID)).resolves.toBe(ALIAS);
  });

  it("rejects when Mirror has no EVM address for the account", async () => {
    mockedFetchAccount.mockResolvedValue(accountWith(null));

    await expect(createMirrorNodeAccountResolver("testnet").evmAddress(ACCOUNT_ID)).rejects.toBeInstanceOf(
      SwapValidationError,
    );
  });
});
