import {
  type MirrorPage,
  type MirrorPaginateOptions,
  type MirrorRequestOptions,
  assertValidEntityId,
  mirrorGetAllPages,
  mirrorRequest,
  mirrorTimestampToDate,
} from "./client";
import { type MirrorTransaction, fetchTransactionsAt } from "./transactions";

export type MirrorKey = {
  _type: string;
  key: string;
};

export type MirrorScheduleSignature = {
  consensus_timestamp: string;
  public_key_prefix: string;
  signature: string;
  type: string;
};

/** Schedule entity from GET /api/v1/schedules/{id} */
export type MirrorSchedule = {
  schedule_id: string;
  creator_account_id: string;
  payer_account_id: string;
  consensus_timestamp: string;
  executed_timestamp: string | null;
  expiration_time: string | null;
  deleted: boolean;
  memo: string;
  wait_for_expiry: boolean;
  admin_key: MirrorKey | null;
  /**
   * Every signature Mirror recorded for the schedule, including the one the
   * ScheduleCreate payer added implicitly. That signature does not count toward
   * the threshold of the scheduled transaction's required keys, so `length`
   * is an upper bound on collected threshold signatures, not the exact count.
   */
  signatures: MirrorScheduleSignature[];
  transaction_body: string;
};

export type MirrorSchedulesResponse = MirrorPage & {
  schedules: MirrorSchedule[];
};

export type ScheduleStatus = "pending" | "executed" | "deleted" | "expired";

export type ScheduleState = {
  status: ScheduleStatus;
  /** Recorded signatures, payer's included (see `MirrorSchedule.signatures`). */
  signatureCount: number;
  executedAt: Date | null;
  expiresAt: Date | null;
  /** True once the schedule can no longer change (executed, deleted or expired). */
  isSettled: boolean;
};

function resolveScheduleStatus(schedule: MirrorSchedule, expiresAt: Date | null, now: Date): ScheduleStatus {
  if (schedule.deleted) return "deleted";
  if (schedule.executed_timestamp) return "executed";
  if (expiresAt && now.getTime() > expiresAt.getTime()) return "expired";
  return "pending";
}

/**
 * Derives a display/polling state from a Mirror schedule.
 * `executed_timestamp` shows up a few seconds after consensus; poll while `status` is "pending".
 * "executed" means the network ran the scheduled transaction, not that it succeeded: a call that
 * reverted is executed too. `fetchScheduleExecution` reads which of the two it was.
 */
export function deriveScheduleState(schedule: MirrorSchedule, now: Date = new Date()): ScheduleState {
  const expiresAt = mirrorTimestampToDate(schedule.expiration_time);
  const status = resolveScheduleStatus(schedule, expiresAt, now);
  return {
    status,
    signatureCount: schedule.signatures.length,
    executedAt: mirrorTimestampToDate(schedule.executed_timestamp),
    expiresAt,
    isSettled: status !== "pending",
  };
}

/**
 * How the scheduled transaction ended, which `executed_timestamp` alone does not say: the network
 * marks a schedule executed as soon as it runs the transaction, whether that succeeded or reverted.
 *
 * - `notRun`: the schedule never ran (pending, deleted or expired).
 * - `unconfirmed`: it ran, but its outcome could not be read yet — Mirror had not indexed the row or
 *   did not answer. Ask again; an outcome never changes once the ledger has it.
 * - `succeeded` / `failed`: read from the scheduled transaction's own row. `result` is the network's
 *   response code, e.g. `CONTRACT_REVERT_EXECUTED` for a registry call that reverted.
 */
export type ScheduleExecution =
  | { status: "notRun" }
  | { status: "unconfirmed" }
  | { status: "succeeded"; transaction: MirrorTransaction }
  | { status: "failed"; result: string; transaction: MirrorTransaction };

const SUCCESS_RESULT = "SUCCESS";

/**
 * Picks the outcome out of the rows Mirror recorded at the schedule's `executed_timestamp`, which is
 * the consensus timestamp of the scheduled transaction itself. A row that is not a scheduled one, or
 * sits at another instant, says nothing about this schedule and leaves the outcome unconfirmed.
 */
export function deriveScheduleExecution(schedule: MirrorSchedule, rows: MirrorTransaction[]): ScheduleExecution {
  if (!schedule.executed_timestamp) return { status: "notRun" };
  const transaction = rows.find(row => row.scheduled && row.consensus_timestamp === schedule.executed_timestamp);
  if (!transaction) return { status: "unconfirmed" };
  if (transaction.result === SUCCESS_RESULT) return { status: "succeeded", transaction };
  return { status: "failed", result: transaction.result, transaction };
}

/**
 * Reads how a schedule's transaction ended. Never throws: a read that fails is `unconfirmed`, the same
 * answer as a row not indexed yet, because a caller does the same thing with both — ask again.
 */
export async function fetchScheduleExecution(
  schedule: MirrorSchedule,
  options: MirrorRequestOptions = {},
): Promise<ScheduleExecution> {
  if (!schedule.executed_timestamp) return { status: "notRun" };
  try {
    return deriveScheduleExecution(schedule, await fetchTransactionsAt(schedule.executed_timestamp, options));
  } catch {
    return { status: "unconfirmed" };
  }
}

/**
 * Nothing about the schedule can change any more: its round is over and, if it ran, how it ended is
 * known. Mirror can serve `executed_timestamp` before the outcome, so settled alone is not final.
 */
export function hasFinalOutcome({ state, execution }: { state: ScheduleState; execution: ScheduleExecution }): boolean {
  return state.isSettled && execution.status !== "unconfirmed";
}

export async function fetchSchedule(scheduleId: string, options: MirrorRequestOptions = {}): Promise<MirrorSchedule> {
  assertValidEntityId(scheduleId, "schedule ID");
  return mirrorRequest<MirrorSchedule>(`/api/v1/schedules/${scheduleId}`, options);
}

export type FetchSchedulesOptions = MirrorPaginateOptions & {
  limit?: number;
  order?: "asc" | "desc";
};

/**
 * Lists schedules created by an account.
 * Mirror's `account.id` filter matches `creator_account_id`, not `payer_account_id`:
 * querying with the payer of the scheduled transaction returns an empty list.
 */
export async function fetchSchedulesByCreator(
  creatorAccountId: string,
  options: FetchSchedulesOptions = {},
): Promise<MirrorSchedule[]> {
  assertValidEntityId(creatorAccountId, "account ID");
  const { limit, order, ...paginateOptions } = options;
  const params = new URLSearchParams({ "account.id": creatorAccountId });
  if (limit != null) params.set("limit", String(limit));
  if (order) params.set("order", order);

  return mirrorGetAllPages<MirrorSchedulesResponse, MirrorSchedule>(
    `/api/v1/schedules?${params.toString()}`,
    page => page.schedules ?? [],
    paginateOptions,
  );
}
