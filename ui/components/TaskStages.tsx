import { useState } from "react";
import { SessionTask } from "../../src/domain/programmeSessions";
import { SkippedTask, UNSKIPPABLE_STAGE } from "../../src/domain/session";
import { DaySetLog, LoggedSet, bestOneRepMax, isLoggable, prescribedSets } from "../../src/domain/setLog";
import { splitPrescription } from "../../src/domain/prescription";
import { Advice, VERDICT_LABELS } from "../../src/domain/progression";

/**
 * The day's work, grouped into collapsible stages — v60's `renderTasks`.
 *
 * The shape matters more than it looks. `.task` is a three-column grid:
 * checkbox, text column, actions. Rendering a task as a two-child list item
 * collapses that grid, which is what wrapped every task name into a narrow
 * ribbon beside an oversized button. And `.task-stage` is a `<details>` — the
 * stage headers are what make a nineteen-task session readable at all, because
 * only the stage you are working through is open.
 */

export interface TaskStagesProps {
  tasks: SessionTask[];
  completed: string[];
  skipped: Record<string, SkippedTask>;
  /** Stage left open; defaults to the first with unresolved work. */
  openStage?: number;
  onToggle: (task: SessionTask, complete: boolean) => void;
  onDetails: (task: SessionTask) => void;
  onSkip: (task: SessionTask) => void;
  /** Skip everything unresolved in one stage, behind a single reason. */
  onSkipStage?: (stageTitle: string, tasks: SessionTask[]) => void;
  onUndoSkip: (task: SessionTask) => void;
  /** What was actually lifted today, keyed by task id. */
  setLog?: DaySetLog;
  onLogSets?: (task: SessionTask, sets: LoggedSet[]) => void;
  /** Last time each lift was done, and whether to move up. Keyed by task id. */
  progression?: Record<string, Advice>;
}

/**
 * The prescription, as a paragraph or as a list.
 *
 * A task holding several movements — most of the warm-up — arrived as one run
 * of middot-separated text that wrapped to five lines, which cannot be read
 * one movement at a time while you are doing it. Where the prescription really
 * is a list, each movement gets its own row with the dose in a column beside
 * it. Where it is one movement with parameters, it renders exactly as before:
 * see `splitPrescription` for how the two are told apart, and why it refuses
 * whenever it cannot tell.
 */
function Prescription({ text }: { text: string }) {
  const movements = splitPrescription(text);
  if (!movements) return <div className="task-prescription">{text}</div>;

  return (
    <ul className="task-movements">
      {movements.map((movement) => (
        <li key={`${movement.name}-${movement.dose ?? ""}`}>
          <span className="movement-name">{movement.name}</span>
          {movement.dose && <span className="movement-dose">{movement.dose}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * What happened last time, and what to do about it.
 *
 * The sets have been recorded since the logger went in and were never shown
 * again anywhere a decision gets made. This is that: the previous session's
 * actual loads, and a verdict — go up, stay, back off, or follow the block —
 * sitting directly under the prescription while the athlete is at the rack.
 *
 * The reasoning is one tap away rather than on the face of it. "Go up to
 * 62.5 kg" is what gets read between sets; why it says so matters only when
 * it is being argued with.
 */
function LastTime({ advice }: { advice: Advice }) {
  const [why, setWhy] = useState(false);
  const last = advice.last;

  return (
    <div className={`last-time verdict-${advice.verdict}`}>
      <p className="last-time-head">
        <span className="verdict-chip">{VERDICT_LABELS[advice.verdict]}</span>
        <strong>{advice.headline}</strong>
      </p>
      {last && (
        <p className="last-time-sets">
          Last time ·{" "}
          <time dateTime={last.date}>
            {new Intl.DateTimeFormat("en-AU", {
              timeZone: "Australia/Brisbane",
              weekday: "short",
              day: "numeric",
              month: "short",
            }).format(new Date(`${last.date}T00:00:00+10:00`))}
          </time>{" "}
          · {last.sets.map((set) => `${set.reps}×${set.kg || "bw"}`).join(" · ")}
        </p>
      )}
      <button className="text-button" type="button" aria-expanded={why} onClick={() => setWhy((open) => !open)}>
        {why ? "Hide why" : "Why?"}
      </button>
      {why && <p className="last-time-why">{advice.reason}</p>}
    </div>
  );
}

/**
 * Reps and load, set by set.
 *
 * Opens pre-filled from the prescription, because the difference between
 * logging four sets in ten seconds and not bothering is exactly this. Nothing
 * is stored until Save — a pre-filled row is a suggestion, not a record.
 */
function SetLogger({
  task,
  logged,
  suggestedKg,
  onSave,
}: {
  task: SessionTask;
  logged: LoggedSet[] | undefined;
  /** Where the progression says to set the bar, when it has a view. */
  suggestedKg?: number;
  onSave: (sets: LoggedSet[]) => void;
}) {
  /**
   * Open on the recommendation, not on the prescription.
   *
   * The advice above says "go up to 62.5 kg" and the logger used to open on
   * whatever the programme wrote — so taking the advice meant retyping it into
   * three rows, and the path of least resistance was to ignore it. Reps still
   * come from the prescription; only the load is overridden.
   */
  const opening = () => {
    const rows = logged ?? prescribedSets(task);
    if (logged || suggestedKg === undefined) return rows;
    return rows.map((row) => ({ ...row, kg: suggestedKg }));
  };

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LoggedSet[]>(opening);

  const best = logged ? bestOneRepMax(logged) : null;

  if (!open) {
    return (
      <div className="setlog-summary">
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setRows(opening());
            setOpen(true);
          }}
        >
          {logged ? "Edit sets" : "Log sets"}
        </button>
        {logged && (
          <span>
            {logged.map((set) => `${set.reps}×${set.kg || "bw"}`).join(" · ")}
            {best ? ` · e1RM ${best} kg` : ""}
          </span>
        )}
      </div>
    );
  }

  const update = (index: number, field: keyof LoggedSet, value: number) =>
    setRows((current) => current.map((row, at) => (at === index ? { ...row, [field]: value } : row)));

  return (
    <form
      className="setlog"
      onSubmit={(event) => {
        event.preventDefault();
        // A zero-rep row is a set that did not happen, not a set of zero.
        onSave(rows.filter((row) => row.reps > 0));
        setOpen(false);
      }}
    >
      <div className="setlog-rows">
        {rows.map((row, index) => (
          <div className="setlog-row" key={index}>
            <span className="setlog-index">{index + 1}</span>
            <label>
              <span>Reps</span>
              <input
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                value={row.reps}
                onChange={(event) => update(index, "reps", Number(event.target.value))}
              />
            </label>
            <label>
              <span>kg</span>
              <input
                type="number"
                min={0}
                max={500}
                step={0.5}
                inputMode="decimal"
                value={row.kg}
                onChange={(event) => update(index, "kg", Number(event.target.value))}
              />
            </label>
            <button
              className="text-button danger-text"
              type="button"
              aria-label={`Remove set ${index + 1}`}
              onClick={() => setRows((current) => current.filter((_, at) => at !== index))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="setlog-actions">
        <button
          className="text-button"
          type="button"
          onClick={() =>
            setRows((current) => [...current, current[current.length - 1] ?? { reps: 5, kg: 0 }])
          }
        >
          + Add set
        </button>
        <button className="btn btn-outline" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="btn btn-dark" type="submit">
          Save sets
        </button>
      </div>
    </form>
  );
}

export function TaskStages({
  tasks,
  completed,
  skipped,
  openStage,
  onToggle,
  onDetails,
  onSkip,
  onSkipStage,
  onUndoSkip,
  setLog,
  onLogSets,
  progression,
}: TaskStagesProps) {
  const done = new Set(completed);
  const isResolved = (task: SessionTask) => done.has(task.id) || Boolean(skipped[task.id]);
  const stages = [...new Set(tasks.map((task) => task.stage))];
  const firstIncomplete = stages.find((stage) =>
    tasks.some((task) => task.stage === stage && !isResolved(task))
  );
  const open = openStage ?? firstIncomplete;

  return (
    <>
      {stages.map((stage) => {
        const stageTasks = tasks.filter((task) => task.stage === stage);
        const first = stageTasks[0];
        const completedCount = stageTasks.filter((task) => done.has(task.id)).length;
        const skippedCount = stageTasks.filter(
          (task) => !done.has(task.id) && skipped[task.id]
        ).length;
        const resolved = completedCount + skippedCount;
        const stageComplete = resolved === stageTasks.length;
        const stageOpen = stage === open;
        const progressLabel = skippedCount
          ? `${skippedCount} skipped`
          : stageComplete
            ? "Complete"
            : "done";
        const unresolvedSkippable = stageTasks.filter(
          (task) => !isResolved(task) && task.stageTitle !== UNSKIPPABLE_STAGE
        );

        return (
          <details
            key={stage}
            className={`card task-stage ${stageComplete ? "stage-complete" : stageOpen ? "stage-current" : ""}`.trim()}
            data-plan-stage={stage}
            open={stageOpen}
          >
            <summary className="stage-head">
              <span className="stage-number">{stage}</span>
              <span className="stage-copy">
                <strong>{first.stageTitle}</strong>
                <small>{first.stageDescription}</small>
              </span>
              <span
                className="stage-progress"
                aria-label={`${resolved} of ${stageTasks.length} tasks resolved${
                  skippedCount ? `, ${skippedCount} skipped` : ""
                }`}
              >
                <strong>
                  {resolved}/{stageTasks.length}
                </strong>
                <small>{progressLabel}</small>
              </span>
              <span className="stage-chevron" aria-hidden="true" />
            </summary>

            {/* Skip the section, not eight tasks one at a time. A stage is the
                unit that actually gets abandoned — the lift got missed, not
                the third exercise in it — and eight separate confirmations is
                why days were left permanently half-resolved. Hidden once
                everything here is resolved, and absent entirely on the health
                hold, which cannot be skipped at all. */}
            {onSkipStage && unresolvedSkippable.length > 1 && (
              <div className="stage-bulk">
                <button
                  className="text-button"
                  type="button"
                  onClick={() => onSkipStage(first.stageTitle, unresolvedSkippable)}
                >
                  Skip all {unresolvedSkippable.length} remaining
                </button>
              </div>
            )}

            <div className="task-list">
              {stageTasks.map((task) => {
                const isDone = done.has(task.id);
                const skip = isDone ? null : skipped[task.id];
                const canSkip = task.stageTitle !== UNSKIPPABLE_STAGE;
                const advice = progression?.[task.id];

                return (
                  <article
                    key={task.id}
                    className={`task ${isDone ? "completed" : ""} ${skip ? "skipped" : ""}`.replace(/\s+/g, " ").trim()}
                    data-task-row={task.id}
                  >
                    <input
                      className="task-check"
                      type="checkbox"
                      aria-label={`${skip ? "Skipped" : "Complete"} ${task.name}`}
                      checked={isDone}
                      disabled={Boolean(skip)}
                      onChange={(event) => onToggle(task, event.target.checked)}
                    />
                    <div>
                      <div className="task-title">
                        {/* A superset is only useful if it is obvious. The
                            badge names the pair and the position in it, so
                            "A1" and "A2" read as one block of work. */}
                        {typeof task.superset === "string" && (
                          <span className="superset-badge">Superset {task.superset}</span>
                        )}
                        {task.name}
                        {skip && <span className="skip-badge">Skipped</span>}
                      </div>
                      <Prescription text={task.prescription} />
                      <p className="task-cue">{task.cue}</p>
                      {/* Above the logger, because it is what decides what
                          goes into it. */}
                      {advice && !isDone && !skip && <LastTime advice={advice} />}
                      {onLogSets && isLoggable(task) && (
                        <SetLogger
                          task={task}
                          logged={setLog?.[task.id]}
                          suggestedKg={advice?.suggestedKg}
                          onSave={(sets) => onLogSets(task, sets)}
                        />
                      )}
                      {skip && (
                        <p className="task-skip-note">
                          <strong>{skip.reason}</strong>
                          {skip.notes ? ` · ${skip.notes}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="task-actions">
                      <button className="task-details" type="button" onClick={() => onDetails(task)}>
                        Details
                      </button>
                      {skip ? (
                        <button className="task-skip undo" type="button" onClick={() => onUndoSkip(task)}>
                          Undo skip
                        </button>
                      ) : (
                        canSkip &&
                        !isDone && (
                          <button className="task-skip" type="button" onClick={() => onSkip(task)}>
                            Skip
                          </button>
                        )
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </details>
        );
      })}
    </>
  );
}
