import { createQueryWrapper, jsonResponse } from "./testUtils";
import { useSchedule } from "./useSchedule";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import executedSchedule from "~~/services/mirror/__fixtures__/schedule-executed.json";

const SCHEDULE_ID = "0.0.10590552";
const FAST_POLL_MS = 20;
const A_FEW_POLLS_MS = 120;

const pendingSchedule = { ...executedSchedule, executed_timestamp: null, expiration_time: null };

function stubFetchWith(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(body, status)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useSchedule", () => {
  it("does not fetch when the schedule id is empty", async () => {
    const fetchMock = stubFetchWith(executedSchedule);

    const { result } = renderHook(() => useSchedule(""), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fetch when the schedule id is malformed", async () => {
    const fetchMock = stubFetchWith(executedSchedule);

    renderHook(() => useSchedule("not-an-id"), { wrapper: createQueryWrapper() });

    await new Promise(resolve => setTimeout(resolve, A_FEW_POLLS_MS));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests the schedule from the network's Mirror Node", async () => {
    const fetchMock = stubFetchWith(executedSchedule);

    const { result } = renderHook(() => useSchedule(SCHEDULE_ID, { network: "mainnet" }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0][0]).toBe(`https://mainnet.mirrornode.hedera.com/api/v1/schedules/${SCHEDULE_ID}`);
  });

  it("returns the derived state next to the raw schedule", async () => {
    stubFetchWith(executedSchedule);

    const { result } = renderHook(() => useSchedule(SCHEDULE_ID), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.data?.state.status).toBe("executed"));
  });

  it("keeps polling while the schedule is pending", async () => {
    const fetchMock = stubFetchWith(pendingSchedule);

    renderHook(() => useSchedule(SCHEDULE_ID, { pollIntervalMs: FAST_POLL_MS }), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("stops polling once the schedule is executed", async () => {
    const fetchMock = stubFetchWith(executedSchedule);

    const { result } = renderHook(() => useSchedule(SCHEDULE_ID, { pollIntervalMs: FAST_POLL_MS }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await new Promise(resolve => setTimeout(resolve, A_FEW_POLLS_MS));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps polling on 404 until Mirror indexes the schedule", async () => {
    const fetchMock = stubFetchWith({ _status: { messages: [{ message: "Not found" }] } }, 404);

    renderHook(() => useSchedule(SCHEDULE_ID, { pollIntervalMs: FAST_POLL_MS }), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("exposes a MirrorNodeError on a non-2xx response", async () => {
    stubFetchWith("boom", 500);

    const { result } = renderHook(() => useSchedule(SCHEDULE_ID), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.error?.message).toBe('Mirror node error 500: "boom"'));
  });
});
