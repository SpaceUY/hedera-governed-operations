import { createQueryWrapper, jsonResponse } from "./testUtils";
import { useTokenRelationship } from "./useTokenRelationship";
import tokenRelationships from "@sh/core/mirror/__fixtures__/token-relationships.json";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useTokenRelationship", () => {
  it("waits until both the account and the token are known", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useTokenRelationship("", "0.0.10671171"), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads whether the account is frozen for that token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(tokenRelationships)));

    const { result } = renderHook(() => useTokenRelationship("0.0.8192684", "0.0.10671171"), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.freeze_status).toBe("UNFROZEN");
  });

  it("runs for the EVM addresses a decoded freeze proposal carries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tokenRelationships));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(
      () =>
        useTokenRelationship(
          "0x00000000000000000000000000000000007d02ac",
          "0x0000000000000000000000000000000000A2d443",
        ),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("succeeds with no relationship when the account never associated the token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ tokens: [], links: { next: null } })));

    const { result } = renderHook(() => useTokenRelationship("0.0.10671142", "0.0.10671171"), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
