import { useState } from "react";
import { IsoDate } from "../../src/domain/state";
import {
  PlanState,
  ThrowIntent,
  acuteChronicRatio,
  checkHighIntentAllowed,
  dayNameForDate,
  throwLoad,
  totalThrowLoad,
} from "../../src/domain/session";

/**
 * Throwing workload logging.
 *
 * The Wednesday/Saturday high-intent restriction is enforced through the
 * domain check on submit, not by hiding the option — so an attempt gets an
 * explanation rather than silently doing nothing.
 */

export interface ThrowingEntry {
  date: IsoDate;
  intent: ThrowIntent;
  throws: number;
}

export interface WorkloadProps {
  date: IsoDate;
  plan: PlanState;
  entries: ThrowingEntry[];
  onLog: (entry: ThrowingEntry) => void;
}

const INTENTS: ThrowIntent[] = ["recovery", "low", "moderate", "high"];

export function Workload({ date, plan, entries, onLog }: WorkloadProps) {
  const [intent, setIntent] = useState<ThrowIntent>("low");
  const [throws, setThrows] = useState(20);
  const [error, setError] = useState("");

  const day = dayNameForDate(date);
  const last7 = totalThrowLoad(entries.slice(-7));
  const last28 = totalThrowLoad(entries.slice(-28));
  const ratio = acuteChronicRatio(last7, last28);

  function handleLog() {
    setError("");
    const check = checkHighIntentAllowed(date, intent, plan);
    if (!check.allowed) {
      setError(check.message);
      return;
    }
    onLog({ date, intent, throws });
  }

  return (
    <section className="card" aria-labelledby="workload-heading">
      <h2 id="workload-heading">Throwing workload</h2>
      <p className="muted">
        {date} — {day}
      </p>

      <label>
        Intent
        <select value={intent} onChange={(event) => setIntent(event.target.value as ThrowIntent)}>
          {INTENTS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      <label>
        Throws
        <input
          type="number"
          min={0}
          max={300}
          value={throws}
          onChange={(event) => setThrows(Number(event.target.value))}
        />
      </label>

      <p className="muted">
        This session scores <strong>{throwLoad({ intent, throws })}</strong> weighted load.
      </p>

      <button type="button" className="btn" onClick={handleLog}>
        Log throwing
      </button>

      {error && (
        <div className="alert danger" role="alert">
          {error}
        </div>
      )}

      <dl className="stat-row">
        <div>
          <dt>7-day load</dt>
          <dd>{last7}</dd>
        </div>
        <div>
          <dt>28-day load</dt>
          <dd>{last28}</dd>
        </div>
        <div>
          <dt>Acute : chronic</dt>
          <dd>{ratio === null ? "Not enough history" : ratio}</dd>
        </div>
      </dl>
    </section>
  );
}
