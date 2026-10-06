import { useMemo } from "react";
import { TrainingHistoryEvent, hydrateTrainingHistory } from "../../src/domain/trainingHistory";
import { Alert, Card, CardHead, EmptyState } from "./Page";

/**
 * The append-only record, made visible.
 *
 * Every check-in, check-out, task tick and throwing entry is logged as it
 * happens and uploaded to the server's write-once table. This card shows the
 * latest of those steps and, plainly, whether any are still only on this
 * device — an upload that is quietly behind is the failure worth seeing.
 */

const LABELS: Record<string, string> = {
  health_check_in_submitted: "Check-in submitted",
  health_check_in_corrected: "Check-in corrected",
  health_check_in_removed: "Check-in reopened",
  session_check_out_submitted: "Check-out submitted",
  session_check_out_corrected: "Check-out corrected",
  session_check_out_removed: "Check-out removed",
  throwing_result_submitted: "Throwing logged",
  throwing_result_corrected: "Throwing corrected",
  throwing_result_removed: "Throwing entry removed",
  task_completed: "Task completed",
  task_reopened: "Task reopened",
  task_skipped: "Task skipped",
  task_skip_reopened: "Skip undone",
};

function label(event: TrainingHistoryEvent): string {
  const base = LABELS[event.type] ?? event.type.replace(/_/g, " ");
  const taskId = event.payload.taskId;
  return typeof taskId === "string" ? `${base} · ${taskId}` : base;
}

function when(iso: string): string {
  const time = new Date(iso);
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(time);
}

export interface TrainingHistoryCardProps {
  history: unknown;
  hasSyncKey: boolean;
  status: string;
}

export function TrainingHistoryCard({ history, hasSyncKey, status }: TrainingHistoryCardProps) {
  const events = useMemo(() => hydrateTrainingHistory(history).events, [history]);
  const pending = events.filter((event) => !event.uploadedAt).length;
  const recent = events.slice(-12).reverse();

  return (
    <Card aria-label="Training history">
      <CardHead
        title="Training history"
        detail={`${events.length} ${events.length === 1 ? "step" : "steps"} recorded. Each one is kept, never rewritten.`}
      />
      {!hasSyncKey ? (
        <Alert tone="warn">History is only on this device. Turn on cloud autosave to keep a permanent copy.</Alert>
      ) : pending ? (
        <Alert tone="warn">
          {pending} {pending === 1 ? "step is" : "steps are"} waiting to upload.{status ? ` ${status}` : ""}
        </Alert>
      ) : (
        <Alert tone="info">{events.length ? "Every step is saved to the permanent record." : status || "Up to date."}</Alert>
      )}
      {recent.length ? (
        <ol className="history-log" aria-label="Recent training history">
          {recent.map((event) => (
            <li key={event.id}>
              <span>{label(event)}</span>
              <small>
                {event.date} · {when(event.occurredAt)}
                {event.uploadedAt ? "" : " · not uploaded"}
              </small>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState title="Nothing yet" detail="Check in, tick off a task or log a throw and it appears here." />
      )}
    </Card>
  );
}
