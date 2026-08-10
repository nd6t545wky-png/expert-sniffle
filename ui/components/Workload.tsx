import { formatIsoDate } from "../state/formatDate";
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
import { Alert, Card, Field, Metric, PageHead } from "./Page";

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

/** Wording, not the raw enum — the original never showed a stored key. */
const INTENTS: { value: ThrowIntent; label: string }[] = [
  { value: "recovery", label: "Recovery — catch play" },
  { value: "low", label: "Low intent" },
  { value: "moderate", label: "Moderate intent" },
  { value: "high", label: "High intent / game" },
];

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
    <>
      <PageHead
        eyebrow="Throwing workload"
        title="Log today's throwing."
        intro={formatIsoDate(date)}
      />

      <Card>
        <div className="form-grid">
          <Field id="intent" label="Intent">
            <select id="intent" value={intent} onChange={(event) => setIntent(event.target.value as ThrowIntent)}>
              {INTENTS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field id="throws" label="Throws" hint={`Scores ${throwLoad({ intent, throws })} weighted load`}>
            <input
              id="throws"
              type="number"
              min={0}
              max={300}
              value={throws}
              onChange={(event) => setThrows(Number(event.target.value))}
            />
          </Field>

          <div className="form-actions">
            <button type="button" className="btn btn-dark" onClick={handleLog}>
              Log throwing
            </button>
          </div>
        </div>
      </Card>

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}

      <section className="grid metrics">
        <Metric label="7-day load" value={last7 || "—"} detail="Weighted by intent" source="Logged throwing" />
        <Metric label="28-day load" value={last28 || "—"} detail="Rolling month" source="Logged throwing" />
        {/* No risk colouring on this tile. The acute:chronic ratio is widely
            used but its statistical properties have been shown to make it an
            unreliable injury predictor (Impellizzeri et al., 2020), and
            painting it red or green asserts a threshold the evidence does not
            support. It is shown as a descriptive trend and labelled as one. */}
        <Metric
          label="Acute : chronic"
          value={ratio === null ? "—" : ratio}
          detail={ratio === null ? "Not enough history" : "7-day vs average week — a trend, not a risk score"}
        />
      </section>

      <p className="fineprint">
        <strong>On this ratio:</strong> the acute:chronic workload ratio describes how this week
        compares with your recent average. It is not an injury-risk model — its statistical
        properties make it unreliable as a predictor, and no threshold here is safe or unsafe.
        Rising load with rising soreness is worth a conversation with your coach; the number on its
        own is not a verdict.
      </p>
    </>
  );
}
