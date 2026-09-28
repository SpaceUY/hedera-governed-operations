import executedSchedule from "./__fixtures__/schedule-executed.json";
import revertedSchedule from "./__fixtures__/schedule-reverted.json";
import rowsAtExecution from "./__fixtures__/transactions-at-executed.json";
import rowsAtRevert from "./__fixtures__/transactions-at-reverted.json";
import { MirrorNodeError } from "./client";
import {
  deriveScheduleExecution,
  deriveScheduleState,
  fetchSchedule,
  fetchScheduleExecution,
  fetchSchedulesByCreator,
  hasFinalOutcome,
} from "./schedules";
import { afterEach, describe, expect, it, vi } from "vitest";

const BEFORE_EXPIRY = new Date("2026-09-24T00:00:00Z");
const AFTER_EXPIRY = new Date("2026-09-25T00:00:00Z");

const pendingSchedule = { ...executedSchedule, executed_timestamp: null };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deriveScheduleState", () => {
  it("reports an executed schedule as executed", () => {
    expect(deriveScheduleState(executedSchedule, BEFORE_EXPIRY).status).toBe("executed");
  });

  it("reports a schedule without executed_timestamp and before expiry as pending", () => {
    expect(deriveScheduleState(pendingSchedule, BEFORE_EXPIRY).status).toBe("pending");
  });

  it("reports a schedule past its expiration_time as expired", () => {
    expect(deriveScheduleState(pendingSchedule, AFTER_EXPIRY).status).toBe("expired");
  });

  it("reports a deleted schedule as deleted even when past expiry", () => {
    expect(deriveScheduleState({ ...pendingSchedule, deleted: true }, AFTER_EXPIRY).status).toBe("deleted");
  });

  it("treats the exact expiration instant as still pending", () => {
    const atExpiry = new Date("2026-09-24T18:34:53.842Z");

    expect(deriveScheduleState(pendingSchedule, atExpiry).status).toBe("pending");
  });

  it("stays pending when Mirror reports no expiration_time", () => {
    expect(deriveScheduleState({ ...pendingSchedule, expiration_time: null }, AFTER_EXPIRY).status).toBe("pending");
  });

  it("counts every recorded signature, including the ScheduleCreate payer's", () => {
    expect(deriveScheduleState(executedSchedule, BEFORE_EXPIRY).signatureCount).toBe(3);
  });

  it("marks executed, deleted and expired schedules as settled", () => {
    const settled = [
      deriveScheduleState(executedSchedule, BEFORE_EXPIRY),
      deriveScheduleState({ ...pendingSchedule, deleted: true }, BEFORE_EXPIRY),
      deriveScheduleState(pendingSchedule, AFTER_EXPIRY),
    ].map(s => s.isSettled);

    expect(settled).toEqual([true, true, true]);
  });

  it("does not mark a pending schedule as settled", () => {
    expect(deriveScheduleState(pendingSchedule, BEFORE_EXPIRY).isSettled).toBe(false);
  });

  it("exposes the expiration as a Date", () => {
    expect(deriveScheduleState(pendingSchedule, BEFORE_EXPIRY).expiresAt?.toISOString()).toBe(
      "2026-09-24T18:34:53.842Z",
    );
  });
});

describe("fetchSchedule", () => {
  it("requests /api/v1/schedules/{id}", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(executedSchedule)));
    vi.stubGlobal("fetch", fetchMock);

    await fetchSchedule("0.0.10590552");

    expect(fetchMock.mock.calls[0][0]).toBe("https://testnet.mirrornode.hedera.com/api/v1/schedules/0.0.10590552");
  });

  it("rejects a malformed schedule id before hitting the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSchedule("abc")).rejects.toThrow("Invalid schedule ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a 404 as a MirrorNodeError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));

    await expect(fetchSchedule("0.0.1")).rejects.toBeInstanceOf(MirrorNodeError);
  });
});

describe("fetchSchedulesByCreator", () => {
  const firstPage = {
    schedules: [executedSchedule],
    links: { next: "/api/v1/schedules?account.id=0.0.8192684&limit=1&schedule.id=lt:0.0.10590552" },
  };
  const lastPage = { schedules: [pendingSchedule], links: { next: null } };

  function stubTwoPages() {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(firstPage)))
      .mockResolvedValueOnce(new Response(JSON.stringify(lastPage)));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("filters with account.id, which Mirror matches against the schedule creator", async () => {
    const fetchMock = stubTwoPages();

    await fetchSchedulesByCreator("0.0.8192684", { limit: 1 });

    expect(fetchMock.mock.calls[0][0]).toContain("/api/v1/schedules?account.id=0.0.8192684&limit=1");
  });

  it("follows links.next and returns the schedules of every page", async () => {
    stubTwoPages();

    await expect(fetchSchedulesByCreator("0.0.8192684", { limit: 1 })).resolves.toHaveLength(2);
  });
});

/**
 * Recorded on testnet: 0.0.10590552 ran a registry call that succeeded, 0.0.10670585 a TokenAdmin
 * freeze of an account that never associated the token, which reverted. Mirror reports both schedules
 * as executed; only the scheduled transaction's row tells them apart.
 */
describe("deriveScheduleExecution", () => {
  it("reports a schedule whose transaction succeeded", () => {
    expect(deriveScheduleExecution(executedSchedule, rowsAtExecution.transactions)).toMatchObject({
      status: "succeeded",
      transaction: { name: "CONTRACTCALL", scheduled: true },
    });
  });

  it("reports a schedule whose transaction reverted, with the network's response code", () => {
    expect(deriveScheduleExecution(revertedSchedule, rowsAtRevert.transactions)).toMatchObject({
      status: "failed",
      result: "CONTRACT_REVERT_EXECUTED",
    });
  });

  it("says a schedule that never ran has no outcome, whatever the rows say", () => {
    expect(deriveScheduleExecution(pendingSchedule, rowsAtExecution.transactions)).toEqual({ status: "notRun" });
  });

  it("leaves the outcome unconfirmed while Mirror has no row for it", () => {
    expect(deriveScheduleExecution(executedSchedule, [])).toEqual({ status: "unconfirmed" });
  });

  it("ignores a row that is not the scheduled transaction", () => {
    const [row] = rowsAtExecution.transactions;
    expect(deriveScheduleExecution(executedSchedule, [{ ...row, scheduled: false }])).toEqual({
      status: "unconfirmed",
    });
  });

  it("ignores a row recorded at another instant", () => {
    const [row] = rowsAtRevert.transactions;
    expect(deriveScheduleExecution(executedSchedule, [row])).toEqual({ status: "unconfirmed" });
  });
});

describe("fetchScheduleExecution", () => {
  it("asks Mirror for the transaction at the schedule's executed_timestamp", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(rowsAtRevert)));
    vi.stubGlobal("fetch", fetchMock);

    await fetchScheduleExecution(revertedSchedule);

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://testnet.mirrornode.hedera.com/api/v1/transactions?timestamp=1790109109.464489702",
    );
  });

  it("does not ask Mirror about a schedule that never ran", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchScheduleExecution(pendingSchedule)).resolves.toEqual({ status: "notRun" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers unconfirmed rather than throwing when Mirror fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));

    await expect(fetchScheduleExecution(executedSchedule)).resolves.toEqual({ status: "unconfirmed" });
  });
});

describe("hasFinalOutcome", () => {
  const executed = deriveScheduleState(executedSchedule, BEFORE_EXPIRY);

  it("is final once an executed schedule's outcome is known", () => {
    expect(
      hasFinalOutcome({
        state: executed,
        execution: { status: "failed", result: "X", transaction: rowsAtRevert.transactions[0] },
      }),
    ).toBe(true);
  });

  it("is not final while an executed schedule's outcome is unconfirmed", () => {
    expect(hasFinalOutcome({ state: executed, execution: { status: "unconfirmed" } })).toBe(false);
  });

  it("is final for a schedule that settled without running", () => {
    const deleted = deriveScheduleState({ ...pendingSchedule, deleted: true }, BEFORE_EXPIRY);
    expect(hasFinalOutcome({ state: deleted, execution: { status: "notRun" } })).toBe(true);
  });

  it("is not final while the schedule is pending", () => {
    const pending = deriveScheduleState(pendingSchedule, BEFORE_EXPIRY);
    expect(hasFinalOutcome({ state: pending, execution: { status: "notRun" } })).toBe(false);
  });
});
