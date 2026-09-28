import { createQueryWrapper, jsonResponse } from "./testUtils";
import { useTransaction } from "./useTransaction";
import transaction from "@sh/core/mirror/__fixtures__/transaction.json";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const SDK_TX_ID = "0.0.8192684@1789670087.589444591";
const FAST_POLL_MS = 20;
const A_FEW_POLLS_MS = 120;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useTransaction", () => {
  it("does not fetch when the transaction id is empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useTransaction(null), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes the SDK id form in the Mirror path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(transaction));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useTransaction(SDK_TX_ID), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://testnet.mirrornode.hedera.com/api/v1/transactions/0.0.8192684-1789670087-589444591",
    );
  });

  it("returns the recorded rows once indexed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(transaction)));

    const { result } = renderHook(() => useTransaction(SDK_TX_ID), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.data).toHaveLength(2));
  });

  it("polls while Mirror answers 404 and settles when the rows arrive", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ _status: { messages: [{ message: "Not found" }] } }, 404))
      .mockResolvedValue(jsonResponse(transaction));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useTransaction(SDK_TX_ID, { pollIntervalMs: FAST_POLL_MS }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await new Promise(resolve => setTimeout(resolve, A_FEW_POLLS_MS));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
