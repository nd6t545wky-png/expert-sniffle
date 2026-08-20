import { useState } from "react";
import { SessionTask } from "../../src/domain/programmeSessions";
import { SkippedTask, UNSKIPPABLE_STAGE } from "../../src/domain/session";
import { DaySetLog, LoggedSet, bestOneRepMax, isLoggable, prescribedSets } from "../../src/domain/setLog";
import { splitPrescription } from "../../src/domain/prescription";

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
  onUndoSkip: (task: SessionTask) => void;
  /** What was actually lifted today, keyed by task id. */
  setLog?: DaySetLog;
  onLogSets?: (task: SessionTask, sets: LoggedSet[]) => void;
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
 * Reps and load, set by set.
 *
 * Opens pre-filled from the prescription, because the difference between
 * logging four sets in ten seconds and not bothering is exactly this. Nothing
 * is stored until Save — a pre-filled row is a suggestion, not a record.
 */
function SetLogger({
  task,
  logged,
  onSave,
}: {
  task: SessionTask;
  logged: LoggedSet[] | undefined;
  onSave: (sets: LoggedSet[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LoggedSet[]>(() => logged ?? prescribedSets(task));

  const best = logged ? bestOneRepMax(logged) : null;

  if (!open) {
    return (
      <div className="setlog-summary">
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setRows(logged ?? prescribedSets(task));
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
  onUndoSkip,
  setLog,
  onLogSets,
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

            <div className="task-list">
              {stageTasks.map((task) => {
                const isDone = done.has(task.id);
                const skip = isDone ? null : skipped[task.id];
                const canSkip = task.stageTitle !== UNSKIPPABLE_STAGE;

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
                      {onLogSets && isLoggable(task) && (
                        <SetLogger
                          task={task}
                          logged={setLog?.[task.id]}
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
