import { createQueryWrapper, jsonResponse } from "./testUtils";
import { useAccount } from "./useAccount";
import { useAccounts } from "./useAccounts";
import account from "@sh/core/mirror/__fixtures__/account.json";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useAccounts", () => {
  it("reads each account once, and keeps the list's identity while no read changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(account));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(() => useAccounts(["0.0.10590498", "", "alice"]), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current[0].account?.memo).toBe("POC GOV 2-of-3"));
    const settled = result.current;
    rerender();
    expect(result.current).toBe(settled);
    expect(result.current.slice(1).map(read => read.account)).toEqual([undefined, undefined]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares useAccount's cache, so an account one of them read is not asked for again", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(account));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => ({ one: useAccount("0.0.10590498"), list: useAccounts([" 0.0.10590498 "]) }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.list[0].account?.memo).toBe("POC GOV 2-of-3"));
    expect(result.current.one.data?.memo).toBe("POC GOV 2-of-3");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
