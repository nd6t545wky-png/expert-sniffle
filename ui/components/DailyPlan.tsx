import { useState } from "react";
import { IsoDate } from "../../src/domain/state";
import { SessionTask } from "../../src/domain/programmeSessions";
import { formatIsoDate } from "../state/formatDate";
import { Alert, Card, PageHead } from "./Page";
import { TaskStages } from "./TaskStages";
import { SkipTaskModal, TaskDetailsModal } from "./TaskModals";
import {
  PlanState,
  ReadinessSubmission,
  SkippedTask,
  completeTask,
  dayNameForDate,
  isHighIntentDay,
  overridePlanLevel,
  sessionProgress,
  skipTask,
  uncompleteTask,
  undoSkipTask,
} from "../../src/domain/session";

/**
 * The day's session, laid out as v60 lays it out: a `.session-layout` with the
 * staged task stack on the left and a `.sticky-panel` carrying the readiness
 * score, progress and guardrails on the right. Locked until readiness is
 * submitted; check-out stays gated until every task is resolved.
 */

export type PlanTask = SessionTask;

export interface DailyPlanProps {
  date: IsoDate;
  plan: PlanState;
  submission?: ReadinessSubmission;
  tasks: PlanTask[];
  /** Title and blurb of the programme's session for this day. */
  sessionTitle?: string;
  sessionDescription?: string;
  sessionDuration?: string;
  sessionStress?: string;
  completed: Record<IsoDate, string[] | undefined>;
  skipped: Record<IsoDate, Record<string, SkippedTask> | undefined>;
  onCompleteTask: (date: IsoDate, taskId: string, next: string[]) => void;
  onSkipTask: (date: IsoDate, next: Record<string, SkippedTask>) => void;
  onOverride: (date: IsoDate, override: NonNullable<ReadinessSubmission["manualOverride"]>) => void;
  /** Takes the athlete to the check-in that unlocks this session. */
  onOpenReadiness?: () => void;
  /** Takes the athlete to the post-session check-out. */
  onOpenCheckout?: () => void;
}

const GUARDRAILS: [string, string][] = [
  ["No pain progression", "Stop if symptoms rise or mechanics change."],
  ["Quality over volume", "Rest enough to preserve the assigned intent."],
  ["Log actual work", "Use PULSE values when available."],
];

export function DailyPlan({
  date,
  plan,
  submission,
  tasks,
  sessionTitle,
  sessionDescription,
  sessionDuration,
  sessionStress,
  completed,
  skipped,
  onCompleteTask,
  onSkipTask,
  onOverride,
  onOpenReadiness,
  onOpenCheckout,
}: DailyPlanProps) {
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [detailsTask, setDetailsTask] = useState<SessionTask | null>(null);
  const [skipCandidate, setSkipCandidate] = useState<SessionTask | null>(null);

  const day = dayNameForDate(date);
  const done = completed[date] ?? [];
  const skips = skipped[date] ?? {};
  const progress = sessionProgress(tasks, done, skips);
  const allResolved = progress.total > 0 && progress.resolved === progress.total;

  function handleToggle(task: SessionTask, complete: boolean) {
    setError("");
    if (!complete) {
      onCompleteTask(date, task.id, uncompleteTask(completed, date, task.id));
      return;
    }
    const outcome = completeTask(completed, plan, date, task.id);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    onCompleteTask(date, task.id, outcome.completed);
  }

  function handleSkip(task: SessionTask, input: { reason: string; notes: string }) {
    setError("");
    const outcome = skipTask(skipped, completed, plan, date, task, input);
    if (!outcome.ok) {
      setError(outcome.message);
      setSkipCandidate(null);
      return;
    }
    onSkipTask(date, outcome.skipped);
    setSkipCandidate(null);
  }

  function handleOverride() {
    setError("");
    const outcome = overridePlanLevel(submission, "full", reason);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    onOverride(date, outcome.override);
    setReason("");
  }

  if (plan.status === "locked") {
    return (
      <>
        <PageHead
          eyebrow={`${day ?? ""} · Session`}
          title={sessionTitle || "Today's session"}
          intro={formatIsoDate(date)}
          className="session-page-head"
        />
        <Card className="gate">
          <div className="gate-icon" aria-hidden="true">
            ✓
          </div>
          <h3>Health check-in required</h3>
          <p>{plan.message}</p>
          {onOpenReadiness && (
            <button className="btn btn-primary" type="button" onClick={onOpenReadiness}>
              Complete check-in <span aria-hidden="true">→</span>
            </button>
          )}
        </Card>
      </>
    );
  }

  const risk = submission?.risk ?? "green";

  return (
    <>
      <PageHead
        eyebrow={`${day ?? ""}${day && isHighIntentDay(day) ? " · High-intent day" : ""}`}
        title={sessionTitle || "Today's session"}
        intro={sessionDescription || formatIsoDate(date)}
        className="session-page-head"
      />

      {plan.status === "held" && (
        <Alert tone="danger" role="alert">
          <strong>Health hold.</strong> {plan.message}
        </Alert>
      )}

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}

      <div className="session-layout">
        <div>
          <section className="session-task-stack" aria-label="Today's workout stages">
            <TaskStages
              tasks={tasks}
              completed={done}
              skipped={skips}
              onToggle={handleToggle}
              onDetails={setDetailsTask}
              onSkip={setSkipCandidate}
              onUndoSkip={(task) => onSkipTask(date, undoSkipTask(skipped, date, task.id))}
            />
          </section>

          {allResolved ? (
            <Card className="gate">
              <div className="gate-icon" aria-hidden="true">
                ✓
              </div>
              <h3>Plan resolved—check out</h3>
              <p>
                Record what actually happened.
                {progress.skipped
                  ? ` ${progress.skipped} task${progress.skipped === 1 ? " was" : "s were"} skipped and will remain separate from completed work.`
                  : ""}
              </p>
              {onOpenCheckout && (
                <button className="btn btn-primary" type="button" onClick={onOpenCheckout}>
                  Open check-out <span aria-hidden="true">→</span>
                </button>
              )}
            </Card>
          ) : (
            <Card className="gate">
              <div className="gate-icon" aria-hidden="true">
                🔒
              </div>
              <h3>Post-session check-out locked</h3>
              <p>
                Complete or skip each assigned task first. Skipped work stays separate from completed
                work and requires a recorded reason.
              </p>
            </Card>
          )}

          {submission && plan.status === "unlocked" && plan.planLevel !== "full" && (
            <Card className="override-card">
              <strong>Return to the full session?</strong>
              <p className="fineprint">A reason is recorded with the override.</p>
              <input
                type="text"
                value={reason}
                placeholder="Why is the full session appropriate today?"
                onChange={(event) => setReason(event.target.value)}
              />
              <button type="button" className="btn btn-outline" onClick={handleOverride}>
                Override to full
              </button>
            </Card>
          )}
        </div>

        <aside className="sticky-panel">
          {submission && (
            <article className={`card readiness-card ${risk}`}>
              <div className="readiness-score">
                <div className="score-orb">{submission.score}</div>
                <div>
                  <span className={`status ${risk}`}>
                    {submission.manualOverride ? "manual 100%" : submission.planLevel}
                  </span>
                  <p>Pitching OS planning score · not medical clearance</p>
                </div>
              </div>
              <p className="readiness-scope">
                Applies to throwing, plyos, gym, speed and conditioning. Warm-up, arm care, fuel and
                recovery remain.
              </p>
            </article>
          )}

          <Card>
            <div className="card-head">
              <div>
                <h3>Session progress</h3>
                <p>
                  {progress.resolved} of {progress.total} resolved
                  {progress.skipped ? ` · ${progress.skipped} skipped` : ""}
                </p>
              </div>
              <strong>{progress.percent}%</strong>
            </div>
            <div className="session-progress">
              <span style={{ width: `${progress.percent}%` }} />
            </div>
            <div className="session-stat">
              <span>{sessionDuration}</span>
              <span>{sessionStress ? `${sessionStress} stress` : ""}</span>
            </div>
          </Card>

          <Card>
            <div className="card-head">
              <div>
                <h3>Today's guardrails</h3>
              </div>
            </div>
            <div className="mini-list">
              {GUARDRAILS.map(([title, body], index) => (
                <div className="mini-row" key={title}>
                  <span className="mini-icon">{index + 1}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </div>

      {detailsTask && <TaskDetailsModal task={detailsTask} onClose={() => setDetailsTask(null)} />}
      {skipCandidate && (
        <SkipTaskModal
          task={skipCandidate}
          onClose={() => setSkipCandidate(null)}
          onSkip={(input) => handleSkip(skipCandidate, input)}
        />
      )}
    </>
  );
}
