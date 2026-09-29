import { useCoSigningAgent } from "./useCoSigningAgent";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAccount } from "~~/hooks/mirror/useAccount";

vi.mock("~~/hooks/mirror/useAccount", () => ({ useAccount: vi.fn() }));

/** 33 bytes of compressed ECDSA key, as Mirror writes it: bare hex. */
const KEY_HEX = `02${"ab".repeat(32)}`;

const readAccount = (data: unknown) =>
  vi.mocked(useAccount).mockReturnValue({ data } as unknown as ReturnType<typeof useAccount>);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("useCoSigningAgent", () => {
  it("is null without a configured agent, and reads no account", () => {
    vi.stubEnv("NEXT_PUBLIC_CO_SIGNING_AGENT_ACCOUNT_ID", "");
    readAccount(undefined);
    const { result } = renderHook(() => useCoSigningAgent("testnet"));
    expect(result.current).toBeNull();
    expect(useAccount).toHaveBeenCalledWith(null, { network: "testnet" });
  });

  it("is null until the agent's account is read, then gives its seat in the council's key form", () => {
    vi.stubEnv("NEXT_PUBLIC_CO_SIGNING_AGENT_ACCOUNT_ID", "0.0.4999");
    readAccount(undefined);
    const { result, rerender } = renderHook(() => useCoSigningAgent("testnet"));
    expect(result.current).toBeNull();

    readAccount({ account: "0.0.4999", key: { _type: "ECDSA_SECP256K1", key: KEY_HEX } });
    rerender();
    const bytes = String.fromCharCode(...KEY_HEX.match(/../g)!.map(pair => Number.parseInt(pair, 16)));
    expect(result.current).toEqual({ accountId: "0.0.4999", seat: btoa(bytes) });
  });
});
