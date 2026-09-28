import { createQueryWrapper, jsonResponse } from "./testUtils";
import { useToken } from "./useToken";
import token from "@sh/core/mirror/__fixtures__/token.json";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useToken", () => {
  it("does not fetch when no token is selected", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useToken(null), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the token and exposes its decimals as a number", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(token)));

    const { result } = renderHook(() => useToken("0.0.10671171"), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.token.symbol).toBe("GOVD");
    expect(result.current.data?.decimals).toBe(0);
  });

  it("runs for the EVM address a decoded proposal carries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(token));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useToken("0x0000000000000000000000000000000000A2d443"), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0][0]).toContain("/api/v1/tokens/0x0000000000000000000000000000000000A2d443");
  });

  it("surfaces a 404 as an error instead of polling", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 404)));

    const { result } = renderHook(() => useToken("0.0.1"), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
