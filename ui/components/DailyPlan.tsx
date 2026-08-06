import { useState } from "react";
import { IsoDate } from "../../src/domain/state";
import {
  PlanState,
  completeTask,
  dayNameForDate,
  isHighIntentDay,
  overridePlanLevel,
  ReadinessSubmission,
} from "../../src/domain/session";

/**
 * The day's session. Locked until readiness is submitted, replaced by
 * recovery work under a hold, and scaled by the readiness workload factor.
 */

export interface PlanTask {
  id: string;
  name: string;
  prescription: string;
}

export interface DailyPlanProps {
  date: IsoDate;
  plan: PlanState;
  submission?: ReadinessSubmission;
  tasks: PlanTask[];
  /** Title of the programme's session for this day, when one is available. */
  sessionTitle?: string;
  completed: Record<IsoDate, string[] | undefined>;
  onCompleteTask: (date: IsoDate, taskId: string, next: string[]) => void;
  onOverride: (date: IsoDate, override: NonNullable<ReadinessSubmission["manualOverride"]>) => void;
}

export function DailyPlan({
  date,
  plan,
  submission,
  tasks,
  sessionTitle,
  completed,
  onCompleteTask,
  onOverride,
}: DailyPlanProps) {
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const day = dayNameForDate(date);
  const done = completed[date] ?? [];

  function handleComplete(taskId: string) {
    setError("");
    const outcome = completeTask(completed, plan, date, taskId);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    onCompleteTask(date, taskId, outcome.completed);
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
      <section className="card" aria-labelledby="plan-heading">
        <h2 id="plan-heading">Today's session</h2>
        <div className="alert" role="status">
          <strong>Locked.</strong> {plan.message}
        </div>
      </section>
    );
  }

  return (
    <section className="card" aria-labelledby="plan-heading">
      <h2 id="plan-heading">{sessionTitle || "Today's session"}</h2>
      <p className="muted">
        {date} — {day}
        {day && isHighIntentDay(day) ? " · high-intent day" : ""}
      </p>

      {plan.status === "held" ? (
        <div className="alert danger" role="alert">
          <strong>Health hold.</strong> {plan.message}
        </div>
      ) : (
        <p className="muted">
          Plan level <strong>{plan.planLevel}</strong> · workload ×{plan.workloadFactor}
        </p>
      )}

      <ul className="task-list">
        {tasks.map((task) => {
          const isDone = done.includes(task.id);
          return (
            <li key={task.id} className={isDone ? "task done" : "task"}>
              <div>
                <strong>{task.name}</strong>
                <span className="muted"> {task.prescription}</span>
              </div>
              <button type="button" className="btn btn-outline" disabled={isDone} onClick={() => handleComplete(task.id)}>
                {isDone ? "Logged" : "Mark complete"}
              </button>
            </li>
          );
        })}
      </ul>

      {submission && plan.status === "unlocked" && plan.planLevel !== "full" && (
        <div className="card override-card">
          <strong>Return to the full session?</strong>
          <p className="muted">A reason is recorded with the override.</p>
          <input
            type="text"
            value={reason}
            placeholder="Why is the full session appropriate today?"
            onChange={(event) => setReason(event.target.value)}
          />
          <button type="button" className="btn btn-outline" onClick={handleOverride}>
            Override to full
          </button>
        </div>
      )}

      {error && (
        <div className="alert danger" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
