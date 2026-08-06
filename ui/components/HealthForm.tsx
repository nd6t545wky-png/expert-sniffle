import { useState } from "react";
import { IsoDate } from "../../src/domain/state";
import { ReadinessInputs, computeReadiness } from "../../src/domain/readiness";
import { PlanState, submitReadiness } from "../../src/domain/session";

/**
 * Pre-session readiness check. Scoring is entirely delegated to
 * src/domain/readiness — this component only collects inputs and renders the
 * outcome, so the thresholds cannot drift between UI and logic.
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
  previousSessionResponse: "same",
};

const PAIN_FIELDS = [
  ["shoulder", "Shoulder"],
  ["elbow", "Elbow"],
  ["forearm", "Forearm"],
  ["lat", "Lat / scap"],
  ["lower", "Lower body"],
] as const;

const SCALE_FIELDS = [
  ["sleepQuality", "Sleep quality"],
  ["energy", "Energy"],
  ["mood", "Mood / motivation"],
  ["stress", "Life stress"],
] as const;

export interface HealthFormProps {
  date: IsoDate;
  plan: PlanState;
  existing: Record<IsoDate, unknown>;
  onSubmitted: (submission: ReturnType<typeof computeReadiness>, date: IsoDate) => void;
}

export function HealthForm({ date, plan, existing, onSubmitted }: HealthFormProps) {
  const [values, setValues] = useState<ReadinessInputs>(DEFAULTS);
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
    <section className="card" aria-labelledby="readiness-heading">
      <h2 id="readiness-heading">Pre-session readiness</h2>
      <p className="muted">{date}</p>

      {alreadySubmitted && (
        <div className="alert" role="status">
          Readiness has already been submitted for {date}.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <label>
          Sleep (hours)
          <input
            type="number"
            min={0}
            max={14}
            step={0.5}
            value={values.sleepHours}
            onChange={(event) => set("sleepHours", Number(event.target.value))}
          />
        </label>

        {SCALE_FIELDS.map(([key, label]) => (
          <label key={key}>
            {label} (1–5)
            <input
              type="range"
              min={1}
              max={5}
              value={values[key] as number}
              onChange={(event) => set(key, Number(event.target.value) as never)}
            />
            <output>{values[key] as number}</output>
          </label>
        ))}

        <fieldset>
          <legend>Soreness / symptoms (0–10)</legend>
          {PAIN_FIELDS.map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="range"
                min={0}
                max={10}
                value={values[key] as number}
                onChange={(event) => set(key, Number(event.target.value) as never)}
              />
              <output>{values[key] as number}</output>
            </label>
          ))}
        </fieldset>

        <label>
          Any illness symptoms?
          <select value={values.illness} onChange={(event) => set("illness", event.target.value as "yes" | "no")}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>

        <label>
          New or worsening warning signs?
          <select
            value={values.warningSigns}
            onChange={(event) => set("warningSigns", event.target.value as "yes" | "no")}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>

        <label>
          How did the last session leave you?
          <select
            value={values.previousSessionResponse}
            onChange={(event) => set("previousSessionResponse", event.target.value as never)}
          >
            <option value="better">Better</option>
            <option value="same">The same</option>
            <option value="worse">Worse</option>
            <option value="much_worse">Much worse</option>
          </select>
        </label>

        <ReadinessPreview result={preview} />

        {error && (
          <div className="alert danger" role="alert">
            {error}
          </div>
        )}

        <button type="submit" className="btn">
          Submit readiness
        </button>
      </form>

      {plan.status === "held" && (
        <div className="alert danger" role="alert">
          <strong>Health hold.</strong> {plan.message}
        </div>
      )}
    </section>
  );
}

function ReadinessPreview({ result }: { result: ReturnType<typeof computeReadiness> }) {
  return (
    <div className={`alert readiness-${result.risk}`} role="status">
      <strong>
        {result.score}/100 — {result.planLevel}
      </strong>
      {result.planLevel === "hold" && (
        <p>
          This is a health hold. It requires qualified review and cannot be overridden in the app.
        </p>
      )}
      <ul>
        {result.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  );
}
