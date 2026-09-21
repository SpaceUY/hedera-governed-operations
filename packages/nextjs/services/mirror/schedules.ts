import {
  type MirrorPage,
  type MirrorPaginateOptions,
  type MirrorRequestOptions,
  assertValidEntityId,
  mirrorGetAllPages,
  mirrorRequest,
  mirrorTimestampToDate,
} from "./client";

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
