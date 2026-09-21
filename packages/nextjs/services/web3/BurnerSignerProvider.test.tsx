import { BurnerSignerProvider, useBurnerSigner } from "./BurnerSignerProvider";
import { BURNER_PRIVATE_KEY_STORAGE_KEY } from "./burnerSigner";
import { PrivateKey } from "@hiero-ledger/sdk";
import { act, renderHook, waitFor } from "@testing-library/react";
import * as chains from "viem/chains";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { fetchAccount } from "~~/services/mirror";

vi.mock("~~/services/mirror", async importOriginal => ({
  ...(await importOriginal<typeof import("~~/services/mirror")>()),
  fetchAccount: vi.fn(),
}));
vi.mock("~~/hooks/scaffold-hbar", () => ({ useTargetNetwork: vi.fn() }));

const ACCOUNT_ID = "0.0.4321";
const privateKey = PrivateKey.generateECDSA();
const mockedFetchAccount = vi.mocked(fetchAccount);
const mockedUseTargetNetwork = vi.mocked(useTargetNetwork);

const renderBurner = () => renderHook(() => useBurnerSigner(), { wrapper: BurnerSignerProvider });

describe("BurnerSignerProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockedUseTargetNetwork.mockReturnValue({ targetNetwork: chains.hederaTestnet });
    mockedFetchAccount.mockResolvedValue({ account: ACCOUNT_ID } as Awaited<ReturnType<typeof fetchAccount>>);
  });

  afterEach(() => {
    mockedFetchAccount.mockReset();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("stays inactive when no key is stored", () => {
    const { result } = renderBurner();

    expect(result.current.status).toBe("inactive");
    expect(mockedFetchAccount).not.toHaveBeenCalled();
  });

  it("activates a burner signer for the account resolved from the stored key", async () => {
    window.localStorage.setItem(BURNER_PRIVATE_KEY_STORAGE_KEY, privateKey.toStringRaw());

    const { result } = renderBurner();

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.signer).toMatchObject({ kind: "burner", accountId: ACCOUNT_ID, network: "testnet" });
  });

  it("reports resolving while the account lookup is in flight", () => {
    window.localStorage.setItem(BURNER_PRIVATE_KEY_STORAGE_KEY, privateKey.toStringRaw());
    mockedFetchAccount.mockReturnValue(new Promise(() => undefined));

    const { result } = renderBurner();

    expect(result.current.status).toBe("resolving");
  });

  it("ignores the key on mainnet with a warning", () => {
    window.localStorage.setItem(BURNER_PRIVATE_KEY_STORAGE_KEY, privateKey.toStringRaw());
    mockedUseTargetNetwork.mockReturnValue({ targetNetwork: chains.hedera });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { result } = renderBurner();

    expect(result.current.status).toBe("inactive");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("only runs on testnet"));
  });

  it("ignores the key in a production build unless the flag opts in", () => {
    window.localStorage.setItem(BURNER_PRIVATE_KEY_STORAGE_KEY, privateKey.toStringRaw());
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { result } = renderBurner();

    expect(result.current.status).toBe("inactive");
  });

  it("exposes a malformed key as an error without activating", () => {
    window.localStorage.setItem(BURNER_PRIVATE_KEY_STORAGE_KEY, "not-a-key");

    const { result } = renderBurner();

    expect(result.current.status).toBe("error");
    expect(result.current.error?.name).toBe("BurnerKeyError");
  });

  it("exposes a failed account lookup as an error", async () => {
    window.localStorage.setItem(BURNER_PRIVATE_KEY_STORAGE_KEY, privateKey.toStringRaw());
    mockedFetchAccount.mockRejectedValue(new Error("mirror down"));

    const { result } = renderBurner();

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.message).toBe("mirror down");
  });

  it("deactivate removes the stored key and goes back to inactive", async () => {
    window.localStorage.setItem(BURNER_PRIVATE_KEY_STORAGE_KEY, privateKey.toStringRaw());
    const { result } = renderBurner();
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.deactivate());

    expect(result.current.status).toBe("inactive");
    expect(window.localStorage.getItem(BURNER_PRIVATE_KEY_STORAGE_KEY)).toBeNull();
  });
});
