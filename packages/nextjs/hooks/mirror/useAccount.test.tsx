import { createQueryWrapper, jsonResponse } from "./testUtils";
import { useAccount } from "./useAccount";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import account from "~~/services/mirror/__fixtures__/account.json";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useAccount", () => {
  it("does not fetch when the account id is empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAccount(""), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches an account by 0.0.x id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(account)));

    const { result } = renderHook(() => useAccount("0.0.10590498"), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.data?.memo).toBe("POC GOV 2-of-3"));
  });

  it("accepts an EVM address as the lookup key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(account));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAccount("0x0000000000000000000000000000000000a19922"), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0][0]).toContain("/api/v1/accounts/0x0000000000000000000000000000000000a19922");
  });

  it("surfaces a 404 as an error instead of polling", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 404)));

    const { result } = renderHook(() => useAccount("0.0.1"), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
