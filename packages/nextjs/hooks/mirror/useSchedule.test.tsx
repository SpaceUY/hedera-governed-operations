import { createQueryWrapper, jsonResponse } from "./testUtils";
import { useSchedule } from "./useSchedule";
import executedSchedule from "@sh/core/mirror/__fixtures__/schedule-executed.json";
import revertedSchedule from "@sh/core/mirror/__fixtures__/schedule-reverted.json";
import rowsAtExecution from "@sh/core/mirror/__fixtures__/transactions-at-executed.json";
import rowsAtRevert from "@sh/core/mirror/__fixtures__/transactions-at-reverted.json";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const SCHEDULE_ID = "0.0.10590552";
const FAST_POLL_MS = 20;
const A_FEW_POLLS_MS = 120;

const pendingSchedule = { ...executedSchedule, executed_timestamp: null, expiration_time: null };

function stubFetchWith(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(body, status)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Serves the schedule and, separately, the rows Mirror recorded at its `executed_timestamp`. */
function stubScheduleAndOutcome(schedule: unknown, rows: unknown) {
  const fetchMock = vi
    .fn()
    .mockImplementation((url: string) =>
      Promise.resolve(jsonResponse(url.includes("/api/v1/transactions") ? rows : schedule)),
    );
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

  it("stops polling once the schedule is executed and its outcome is known", async () => {
    const fetchMock = stubScheduleAndOutcome(executedSchedule, rowsAtExecution);

    const { result } = renderHook(() => useSchedule(SCHEDULE_ID, { pollIntervalMs: FAST_POLL_MS }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await new Promise(resolve => setTimeout(resolve, A_FEW_POLLS_MS));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tells an execution that reverted apart from one that succeeded", async () => {
    stubScheduleAndOutcome(revertedSchedule, rowsAtRevert);

    const { result } = renderHook(() => useSchedule(revertedSchedule.schedule_id), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect([result.current.data?.state.status, result.current.data?.execution]).toMatchObject([
      "executed",
      { status: "failed", result: "CONTRACT_REVERT_EXECUTED" },
    ]);
  });

  it("keeps polling an executed schedule until Mirror serves its outcome", async () => {
    const fetchMock = stubScheduleAndOutcome(executedSchedule, { transactions: [], links: { next: null } });

    renderHook(() => useSchedule(SCHEDULE_ID, { pollIntervalMs: FAST_POLL_MS }), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4));
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
