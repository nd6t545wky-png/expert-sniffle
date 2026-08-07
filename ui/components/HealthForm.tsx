import { useState } from "react";
import { IsoDate } from "../../src/domain/state";
import { ReadinessInputs, computeReadiness } from "../../src/domain/readiness";
import { PlanState, submitReadiness } from "../../src/domain/session";
import { Alert, Card, Field, FormDivider, PageHead } from "./Page";

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
    <>
      <PageHead
        eyebrow="Health check-in"
        title="How are you today?"
        intro="This sets today's workload. Answer honestly — it is the only input that can hold a session."
        className="session-page-head"
      />

      {alreadySubmitted && <Alert>Readiness has already been submitted for {date}.</Alert>}

      <Card>
        <form className="form-grid" onSubmit={handleSubmit}>
          <FormDivider title="Sleep and energy" detail="Last night" />

          <Field id="sleepHours" label="Sleep duration" hint="Hours last night">
            <input
              id="sleepHours"
              type="number"
              min={0}
              max={14}
              step={0.5}
              value={values.sleepHours}
              onChange={(event) => set("sleepHours", Number(event.target.value))}
            />
          </Field>

          {SCALE_FIELDS.map(([key, label]) => (
            <Field key={key} id={key} label={label} hint={`${values[key] as number} of 5`}>
              <input
                id={key}
                type="range"
                min={1}
                max={5}
                value={values[key] as number}
                onChange={(event) => set(key, Number(event.target.value) as never)}
              />
            </Field>
          ))}

          <FormDivider title="Soreness and symptoms" detail="0 = nothing, 10 = severe" />

          {PAIN_FIELDS.map(([key, label]) => (
            <Field key={key} id={key} label={label} hint={`${values[key] as number} of 10`}>
              <input
                id={key}
                type="range"
                min={0}
                max={10}
                value={values[key] as number}
                onChange={(event) => set(key, Number(event.target.value) as never)}
              />
            </Field>
          ))}

          <FormDivider title="Flags" detail="These can hold the session" />

          <Field id="illness" label="Any illness symptoms?">
            <select id="illness" value={values.illness} onChange={(event) => set("illness", event.target.value as "yes" | "no")}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Field>

          <Field id="warningSigns" label="New or worsening warning signs?">
            <select
              id="warningSigns"
              value={values.warningSigns}
              onChange={(event) => set("warningSigns", event.target.value as "yes" | "no")}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Field>

          <Field id="previousSessionResponse" label="How did the last session leave you?" full>
            <select
              id="previousSessionResponse"
              value={values.previousSessionResponse}
              onChange={(event) => set("previousSessionResponse", event.target.value as never)}
            >
              <option value="better">Better</option>
              <option value="same">The same</option>
              <option value="worse">Worse</option>
              <option value="much_worse">Much worse</option>
            </select>
          </Field>

          <div className="form-actions">
            <button type="submit" className="btn btn-dark">
              Submit readiness
            </button>
          </div>
        </form>
      </Card>

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
