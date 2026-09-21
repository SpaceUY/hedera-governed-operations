import { createQueryWrapper, jsonResponse } from "./testUtils";
import { useTopicMessagesFeed } from "./useTopicMessagesFeed";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import page1 from "~~/services/mirror/__fixtures__/topic-messages-page-1.json";

const TOPIC_ID = "0.0.10590564";
const FAST_POLL_MS = 20;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useTopicMessagesFeed", () => {
  it("does not fetch when the topic id is empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useTopicMessagesFeed(""), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns decoded messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(page1)));

    const { result } = renderHook(() => useTopicMessagesFeed(TOPIC_ID), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.data?.[0].json).toMatchObject({ kind: "D4-allowance" }));
  });

  it("passes limit and order to the Mirror request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(page1));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useTopicMessagesFeed(TOPIC_ID, { limit: 5, order: "asc" }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0][0]).toContain("limit=5&order=asc");
  });

  it("refetches on the configured interval", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(page1)));
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useTopicMessagesFeed(TOPIC_ID, { refetchInterval: FAST_POLL_MS }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });
});
