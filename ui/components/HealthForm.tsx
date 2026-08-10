import { useState } from "react";
import { IsoDate } from "../../src/domain/state";
import { ReadinessInputs, computeReadiness } from "../../src/domain/readiness";
import { PlanState, submitReadiness } from "../../src/domain/session";
import { Alert } from "./Page";
import { RangeField } from "./RangeField";

/**
 * Pre-session readiness check.
 *
 * Shaped to the prototype's `renderPreForm`: an `article.card.gate` with an
 * icon, a heading, the explanation, then `form#pre-form.form-grid`. Field
 * order, labels, helper text and control types are the original's — sliders
 * are `RangeField`, sleep quality is a select, the warning-signs question
 * carries `.warning-field`.
 *
 * Scoring is delegated entirely to src/domain/readiness, so the thresholds
 * cannot drift between what is shown and what is applied.
 */

const DEFAULTS: ReadinessInputs = {
  sleepHours: 8,
  sleepQuality: 4,
  energy: 4,
  mood: 4,
  stress: 2,
  shoulder: 0,
  elbow: 0,
  forearm: 0,
  lat: 0,
  lower: 0,
  illness: "no",
  warningSigns: "no",
  previousSessionResponse: "as_expected",
};

const SLEEP_QUALITY_LABELS = ["", "Poor", "Below average", "Average", "Good", "Excellent"];

/** name, label, min, max, helper — verbatim from the prototype's rangeField calls. */
const SCALE_FIELDS = [
  ["energy", "Energy", 1, 5, "1 empty · 5 energised"],
  ["mood", "Mood / motivation", 1, 5, "1 low · 5 excellent"],
  ["stress", "Life stress", 1, 5, "1 low · 5 very high"],
] as const;

const PAIN_FIELDS = [
  ["shoulder", "Shoulder soreness / pain"],
  ["elbow", "Elbow soreness / pain"],
  ["forearm", "Forearm / grip"],
  ["lat", "Lat / upper back"],
  ["lower", "Lower-body soreness"],
] as const;

export interface HealthFormProps {
  date: IsoDate;
  plan: PlanState;
  existing: Record<IsoDate, unknown>;
  onSubmitted: (submission: ReturnType<typeof computeReadiness>, date: IsoDate) => void;
}

export function HealthForm({ date, plan, existing, onSubmitted }: HealthFormProps) {
  const [values, setValues] = useState<ReadinessInputs>(DEFAULTS);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string>("");

  const preview = computeReadiness(values);
  const alreadySubmitted = existing[date] !== undefined;

  function set<K extends keyof ReadinessInputs>(key: K, value: ReadinessInputs[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    // Duplicate protection lives in the domain layer, not in a disabled button.
    const outcome = submitReadiness(existing, date, preview);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    onSubmitted(preview, date);
  }

  return (
    <>
      {alreadySubmitted && <Alert>Readiness has already been submitted for {date}.</Alert>}

      <article className="card gate">
        <div className="gate-icon">♡</div>
        <h3>Complete the health check-in</h3>
        <p>
          The daily plan stays hidden until this quick check is submitted. Your answers set today's
          training level.
        </p>

        <form id="pre-form" className="form-grid" data-date={date} onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="sleepHours">Sleep duration</label>
            <input
              id="sleepHours"
              name="sleepHours"
              type="number"
              min={0}
              max={14}
              step={0.1}
              value={values.sleepHours}
              onChange={(event) => set("sleepHours", Number(event.target.value))}
              required
            />
            <small>Hours last night</small>
          </div>

          <div className="field">
            <label htmlFor="sleepQuality">Sleep quality</label>
            <select
              id="sleepQuality"
              name="sleepQuality"
              value={values.sleepQuality}
              onChange={(event) => set("sleepQuality", Number(event.target.value))}
              required
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value} · {SLEEP_QUALITY_LABELS[value]}
                </option>
              ))}
            </select>
            <small>Required when no device score is available</small>
          </div>

          {SCALE_FIELDS.map(([key, label, min, max, help]) => (
            <RangeField
              key={key}
              name={key}
              label={label}
              min={min}
              max={max}
              help={help}
              value={values[key] as number}
              onChange={(value) => set(key, value as never)}
            />
          ))}

          <div className="field">
            <label htmlFor="previousSessionResponse">Response to last session</label>
            <select
              id="previousSessionResponse"
              name="previousSessionResponse"
              value={values.previousSessionResponse}
              onChange={(event) => set("previousSessionResponse", event.target.value as never)}
              required
            >
              <option value="better">Better than expected</option>
              <option value="as_expected">As expected</option>
              <option value="worse">Worse than expected</option>
              <option value="much_worse">Much worse than expected</option>
            </select>
          </div>

          <div className="field warning-field">
            <label htmlFor="warningSigns">New warning signs?</label>
            <select
              id="warningSigns"
              name="warningSigns"
              value={values.warningSigns}
              onChange={(event) => set("warningSigns", event.target.value as "yes" | "no")}
              required
            >
              <option value="no">No</option>
              <option value="yes">Yes — hold today's plan</option>
            </select>
            <small>
              New sharp or worsening pain, weakness, numbness, or symptoms changing your throwing
              mechanics
            </small>
          </div>

          {PAIN_FIELDS.map(([key, label]) => (
            <RangeField
              key={key}
              name={key}
              label={label}
              min={0}
              max={10}
              help="0 none · 10 severe"
              value={values[key] as number}
              onChange={(value) => set(key, value as never)}
            />
          ))}

          <div className="field">
            <label htmlFor="illness">Illness symptoms</label>
            <select
              id="illness"
              name="illness"
              value={values.illness}
              onChange={(event) => set("illness", event.target.value as "yes" | "no")}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
            <small>Fever, infection symptoms or unusual malaise</small>
          </div>

          <div className="field full">
            <label htmlFor="preNotes">Notes</label>
            <textarea
              id="preNotes"
              name="notes"
              placeholder="Anything affecting today's plan?"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <div className="form-actions">
            <button className="btn btn-dark" type="submit">
              Set today's plan
            </button>
          </div>
        </form>

        <p className="fineprint">
          <strong>What this does:</strong> Pitching OS applies a transparent planning heuristic to
          the information above and returns 100%, 75%, 50% or a hold. This is not diagnosis or
          medical clearance. New or worsening pain, illness, weakness, numbness or altered mechanics
          needs qualified clinical or coaching review.
        </p>
      </article>

      <ReadinessPreview result={preview} />

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}

      {plan.status === "held" && (
        <Alert tone="danger" role="alert">
          <strong>Health hold.</strong> {plan.message}
        </Alert>
      )}
    </>
  );
}

const RISK_TONE: Record<string, string> = {
  green: "success",
  yellow: "warn",
  orange: "recovery",
  red: "danger",
};

function ReadinessPreview({ result }: { result: ReturnType<typeof computeReadiness> }) {
  // The prototype's risk banner: `.alert` plus a tone class, an icon column and
  // the reasons as `.adaptation-reasons`.
  const icon = { full: "100", reduced: "75", recovery: "50", hold: "!" }[result.planLevel];
  return (
    <div className={`alert ${RISK_TONE[result.risk]} adaptation-alert session-status`} role="status">
      <span className="session-status-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <strong>
          {result.score}/100 — {result.planLevel}
        </strong>
        {result.planLevel === "hold" && (
          <span>
            This is a health hold. It requires qualified review and cannot be overridden in the app.
          </span>
        )}
        {result.reasons.length > 0 && (
          <ul className="adaptation-reasons">
            {result.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
