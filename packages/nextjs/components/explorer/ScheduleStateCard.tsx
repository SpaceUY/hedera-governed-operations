"use client";

import { proofWallConfig } from "~~/config/proofWallConfig";
import { useSchedule } from "~~/hooks/mirror";
import type { ScheduleStatus } from "~~/services/mirror";
import { isMirrorNotFound, isValidEntityId } from "~~/services/mirror";

const STATUS_BADGE_CLASS: Record<ScheduleStatus, string> = {
  pending: "badge-warning",
  executed: "badge-success",
  deleted: "badge-error",
  expired: "badge-neutral",
};

function formatDate(date: Date | null): string {
  return date ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
}

type ScheduleStateCardProps = {
  scheduleId: string;
};

export function ScheduleStateCard({ scheduleId }: ScheduleStateCardProps) {
  const { data, error, isFetching, isSuccess } = useSchedule(scheduleId);

  if (!scheduleId) {
    return <p className="text-sm text-base-content/60">Paste a schedule id to see its state.</p>;
  }

  if (!isValidEntityId(scheduleId)) {
    return <p className="text-sm text-warning">Expected an id like 0.0.12345.</p>;
  }

  if (error && isMirrorNotFound(error)) {
    return (
      <p className="text-sm text-base-content/60">
        Not indexed yet — Mirror lags consensus by a few seconds. Polling until it appears.
      </p>
    );
  }

  if (error) {
    return <p className="text-sm text-error">{error.message}</p>;
  }

  if (!isSuccess) {
    return <span className="loading loading-spinner loading-sm" aria-label="Loading schedule" />;
  }

  const { schedule, state } = data;

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt className="text-base-content/60">Status</dt>
      <dd className="flex items-center gap-2">
        <span className={`badge ${STATUS_BADGE_CLASS[state.status]}`}>{state.status}</span>
        {isFetching && <span className="loading loading-spinner loading-xs" aria-label="Refreshing" />}
      </dd>
      <dt className="text-base-content/60">Executed</dt>
      <dd>{formatDate(state.executedAt)}</dd>
      <dt className="text-base-content/60">Expires</dt>
      <dd>{formatDate(state.expiresAt)}</dd>
      <dt className="text-base-content/60">Deleted</dt>
      <dd>{schedule.deleted ? "yes" : "no"}</dd>
      <dt className="text-base-content/60">Signatures</dt>
      <dd title="Includes the ScheduleCreate payer's signature, which does not count toward the threshold">
        {state.signatureCount} recorded
      </dd>
      <dt className="text-base-content/60">Creator / payer</dt>
      <dd className="font-mono">
        {schedule.creator_account_id} / {schedule.payer_account_id}
      </dd>
      <dt className="text-base-content/60">Memo</dt>
      <dd className="break-words">{schedule.memo || "—"}</dd>
      <dt className="text-base-content/60">HashScan</dt>
      <dd>
        <a
          className="link link-primary"
          href={`${proofWallConfig.hashScanBaseUrl}/schedule/${schedule.schedule_id}`}
          target="_blank"
          rel="noreferrer"
        >
          {schedule.schedule_id}
        </a>
      </dd>
    </dl>
  );
}
