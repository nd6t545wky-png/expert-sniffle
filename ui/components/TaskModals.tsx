import { useEffect, useRef, useState } from "react";
import { SessionTask } from "../../src/domain/programmeSessions";

/**
 * The two dialogs the daily plan opens: task detail, and skip-with-a-reason.
 * Both reproduce v60's `.modal-backdrop` > `.modal` structure.
 *
 * Escape closes, focus moves into the dialog on open and returns to where it
 * came from on close, and a click on the backdrop — but not inside the panel —
 * dismisses. A `<dialog>` element would give some of that for free, but the
 * stylesheet is written against these class names, and the stylesheet is the
 * contract here.
 */

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    returnFocus.current = document.activeElement;
    panel.current?.querySelector<HTMLElement>("button, select, textarea, input")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      (returnFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        // Only a click on the backdrop itself, not one that bubbled out of the
        // panel — otherwise selecting text in the dialog closes it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <article className="modal" role="dialog" aria-modal="true" ref={panel}>
        {children}
      </article>
    </div>
  );
}

const FALLBACKS = {
  setup: "Follow the session setup and use appropriate space and equipment.",
  execution: "Use controlled, high-quality repetitions.",
  rest: "Rest enough to preserve quality.",
  stop: "Stop for pain or loss of movement quality.",
};

export function TaskDetailsModal({ task, onClose }: { task: SessionTask; onClose: () => void }) {
  const blocks: [string, string][] = [
    ["Why it is here", task.cue],
    ["Setup", task.setup || FALLBACKS.setup],
    ["Execution", task.execution || FALLBACKS.execution],
    ["Rest", task.rest || FALLBACKS.rest],
    ["Stop rule", task.stop || FALLBACKS.stop],
  ];

  // Only the recovery protocol carries this, and only where a real paper sits
  // behind the dose. Shown last: it is what you read when you want to argue
  // with the prescription rather than do it.
  const evidence = typeof task.evidence === "string" ? task.evidence : "";
  if (evidence) blocks.push(["Evidence", evidence]);

  return (
    <Backdrop onClose={onClose}>
      <header className="modal-head">
        <div>
          <h2>{task.name}</h2>
          <p>{task.prescription}</p>
        </div>
        <button className="modal-close" type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="modal-body">
        {/* When readiness has changed the dose, the original stays one tap
            away — the reduced numbers replace it on the card, they do not
            hide it. */}
        {Boolean(task.adapted) && typeof task.adaptationNote === "string" && (
          <div className="detail-block adaptation-detail">
            <span>Readiness adjustment</span>
            <p>{task.adaptationNote}</p>
          </div>
        )}
        {blocks.map(([label, body]) => (
          <div className="detail-block" key={label}>
            <span>{label}</span>
            <p>{body}</p>
          </div>
        ))}
      </div>
    </Backdrop>
  );
}

/** v60's reason list, verbatim. */
export const SKIP_REASONS = [
  "Readiness-adjusted omission",
  "Pain or symptom response",
  "Coach or clinician direction",
  "Equipment unavailable",
  "Time constraint",
  "Other recorded reason",
];

export function SkipTaskModal({
  task,
  onClose,
  onSkip,
}: {
  task: SessionTask;
  onClose: () => void;
  onSkip: (input: { reason: string; notes: string }) => void;
}) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <Backdrop onClose={onClose}>
      <header className="modal-head">
        <div>
          <p className="eyebrow">Daily plan</p>
          <h2>Skip {task.name}?</h2>
          <p>Skipping resolves this task without recording it as completed.</p>
        </div>
        <button className="modal-close" type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="modal-body">
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            onSkip({ reason, notes });
          }}
        >
          <div className="field full">
            <label htmlFor="taskSkipReason">Reason</label>
            <select
              id="taskSkipReason"
              name="reason"
              value={reason}
              required
              onChange={(event) => setReason(event.target.value)}
            >
              <option value="">Select a reason…</option>
              {SKIP_REASONS.map((value) => (
                <option key={value} value={value}>
                  {value === "Other recorded reason" ? "Other" : value}
                </option>
              ))}
            </select>
          </div>
          <div className="field full">
            <label htmlFor="taskSkipNotes">Optional note</label>
            <textarea
              id="taskSkipNotes"
              name="notes"
              maxLength={240}
              placeholder="Add useful context for your session history."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <p className="fineprint field full">
            <strong>What this means:</strong> the task will count as resolved for check-out, stay
            labelled Skipped, and sync with your account. It is not recorded as completed and does
            not add workload.
          </p>
          <div className="form-actions">
            <button className="btn btn-outline" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-dark" type="submit">
              Skip task
            </button>
          </div>
        </form>
      </div>
    </Backdrop>
  );
}
