import { SessionTask } from "../../src/domain/programmeSessions";
import { SkippedTask, UNSKIPPABLE_STAGE } from "../../src/domain/session";

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
                      <div className="task-prescription">{task.prescription}</div>
                      <p className="task-cue">{task.cue}</p>
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
