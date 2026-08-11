import { useState } from "react";
import { IsoDate } from "../../src/domain/state";
import {
  ARM_TESTS,
  ArmExam,
  ArmTestId,
  SideReadings,
  armFindings,
  armScore,
  armTrend,
  erIrRatio,
  fatigueRetention,
  latestOutingPair,
  limbSymmetry,
} from "../../src/domain/armCare";
import { Alert, EmptyState } from "./Page";
import { formatIsoDate } from "../state/formatDate";

/**
 * The arm screen: a dynamometer battery scored against the athlete's own
 * history.
 *
 * Every number on this card prints its own definition. An arm-health figure
 * an athlete cannot check is one they either over-trust or ignore, and both
 * are worse than the soreness slider this replaces.
 */

export interface ArmCareProps {
  date: IsoDate;
  exams: ArmExam[];
  bodyweightKg: number | null;
  onSave: (exam: ArmExam) => void;
  onRemove: (id: string) => void;
}

const TIMING_LABEL: Record<ArmExam["timing"], string> = {
  fresh: "Fresh — a normal test day",
  preOuting: "Before an outing",
  postOuting: "After an outing",
};

type Draft = Record<string, string>;

const key = (side: "t" | "n", test: ArmTestId) => `${side}.${test}`;

function readings(draft: Draft, side: "t" | "n"): SideReadings {
  const out: SideReadings = {};
  for (const test of ARM_TESTS) {
    const value = Number(draft[key(side, test.id)]);
    if (Number.isFinite(value) && value > 0) out[test.id] = value;
  }
  return out;
}

export function ArmCare({ date, exams, bodyweightKg, onSave, onRemove }: ArmCareProps) {
  const [open, setOpen] = useState(false);
  const [timing, setTiming] = useState<ArmExam["timing"]>("fresh");
  const [weight, setWeight] = useState(bodyweightKg ? String(bodyweightKg) : "");
  const [draft, setDraft] = useState<Draft>({});
  const [error, setError] = useState("");

  const latest = exams[exams.length - 1] ?? null;
  const trend = armTrend(exams);
  const pair = latestOutingPair(exams);
  const fatigue = pair ? fatigueRetention(pair.pre, pair.post) : null;
  const score = latest ? armScore(latest) : null;
  const ratio = latest ? erIrRatio(latest.throwing) : null;
  const symmetry = latest ? limbSymmetry(latest) : null;
  const findings = latest ? armFindings(latest, trend, fatigue) : [];

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const bodyweight = Number(weight);
    if (!Number.isFinite(bodyweight) || bodyweight <= 0) {
      setError("Enter your bodyweight — every figure here is per kilogram.");
      return;
    }
    const throwing = readings(draft, "t");
    if (Object.keys(throwing).length === 0) {
      setError("Enter at least one throwing-arm reading.");
      return;
    }
    onSave({
      id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      date,
      timing,
      bodyweightKg: bodyweight,
      throwing,
      nonThrowing: readings(draft, "n"),
    });
    setDraft({});
    setOpen(false);
  }

  return (
    <article className="card card-pad">
      <div className="card-head">
        <div>
          <h3>Arm screen</h3>
          <p>Dynamometer readings, scored against your own history.</p>
        </div>
      </div>

      {!latest ? (
        <EmptyState
          title="No arm screen recorded yet"
          detail="Six isometric holds against a hand-held dynamometer, both arms. Takes a few minutes."
        />
      ) : (
        <>
          <div className="arm-metrics">
            {score && (
              <div className="arm-metric">
                <span>Arm Score</span>
                <strong>{score.score}</strong>
                <small>
                  summed strength as % of bodyweight
                  {score.complete ? "" : ` · ${score.testsUsed} of ${ARM_TESTS.length} tests`}
                </small>
              </div>
            )}
            {ratio && (
              <div className={`arm-metric ${ratio.belowThreshold ? "flag" : ""}`.trim()}>
                <span>ER : IR</span>
                <strong>{ratio.value.toFixed(2)}</strong>
                <small>external ÷ internal rotation · floor 0.70</small>
              </div>
            )}
            {symmetry && (
              <div className={`arm-metric ${symmetry.belowThreshold ? "flag" : ""}`.trim()}>
                <span>Symmetry</span>
                <strong>{symmetry.value}%</strong>
                <small>throwing ÷ other arm · band 85–115%</small>
              </div>
            )}
            {fatigue && (
              <div className={`arm-metric ${fatigue.belowThreshold ? "flag" : ""}`.trim()}>
                <span>Retention</span>
                <strong>{fatigue.value}%</strong>
                <small>strength held after the last outing · target 90%</small>
              </div>
            )}
          </div>

          <p className="fineprint arm-context">
            Latest screen {formatIsoDate(latest.date)} · {TIMING_LABEL[latest.timing]}
            {trend?.average !== null && trend
              ? ` · your average Arm Score is ${trend.average} over ${trend.observations} prior screens`
              : trend
                ? ` · ${trend.observations} of ${3} screens recorded before a trend is shown`
                : ""}
          </p>

          {findings.length > 0 && (
            <Alert tone={findings.some((f) => f.severity === "watch") ? "warn" : "info"} role="status">
              <strong>What the numbers say</strong>
              <ul className="arm-findings">
                {findings.map((finding) => (
                  <li key={finding.text}>{finding.text}</li>
                ))}
              </ul>
            </Alert>
          )}
        </>
      )}

      {!open ? (
        <div className="form-actions">
          <button className="btn btn-dark" type="button" onClick={() => setOpen(true)}>
            Record a screen
          </button>
        </div>
      ) : (
        <form className="arm-form" onSubmit={handleSave}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="armTiming">When</label>
              <select
                id="armTiming"
                value={timing}
                onChange={(event) => setTiming(event.target.value as ArmExam["timing"])}
              >
                {(Object.keys(TIMING_LABEL) as ArmExam["timing"][]).map((value) => (
                  <option key={value} value={value}>
                    {TIMING_LABEL[value]}
                  </option>
                ))}
              </select>
              <small>A before/after pair on one day gives the retention figure</small>
            </div>
            <div className="field">
              <label htmlFor="armWeight">Bodyweight</label>
              <input
                id="armWeight"
                type="number"
                min={30}
                max={200}
                step={0.1}
                inputMode="decimal"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
              />
              <small>kg · every figure here is relative to it</small>
            </div>
          </div>

          <div className="scroll-x">
            <table className="arm-table">
              <thead>
                <tr>
                  <th scope="col">Test</th>
                  <th scope="col">Throwing</th>
                  <th scope="col">Other</th>
                </tr>
              </thead>
              <tbody>
                {ARM_TESTS.map((test) => (
                  <tr key={test.id}>
                    <th scope="row">{test.label}</th>
                    {(["t", "n"] as const).map((side) => (
                      <td key={side}>
                        <input
                          type="number"
                          min={0}
                          max={200}
                          step={0.1}
                          inputMode="decimal"
                          placeholder="kg"
                          aria-label={`${test.label}, ${side === "t" ? "throwing" : "other"} arm`}
                          value={draft[key(side, test.id)] ?? ""}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              [key(side, test.id)]: event.target.value,
                            }))
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && (
            <Alert tone="warn" role="alert">
              {error}
            </Alert>
          )}

          <div className="form-actions">
            <button className="btn btn-outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-dark" type="submit">
              Save screen
            </button>
          </div>
        </form>
      )}

      {exams.length > 0 && (
        <details className="arm-history">
          <summary>Previous screens ({exams.length})</summary>
          <div className="scroll-x">
            <table className="arm-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">When</th>
                  <th scope="col">Score</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {[...exams].reverse().map((item) => {
                  const value = armScore(item);
                  return (
                    <tr key={item.id}>
                      <td>{formatIsoDate(item.date, { day: "numeric", month: "short" })}</td>
                      <td>{item.timing === "fresh" ? "Fresh" : item.timing === "preOuting" ? "Pre" : "Post"}</td>
                      <td>
                        {value ? value.score : "—"}
                        {value && !value.complete ? "*" : ""}
                      </td>
                      <td>
                        <button
                          className="text-button danger-text"
                          type="button"
                          aria-label={`Remove screen from ${item.date}`}
                          onClick={() => onRemove(item.id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="fineprint">* Partial battery — not compared against complete screens.</p>
        </details>
      )}

      <p className="fineprint">
        <strong>What this is:</strong> a repeatable strength screen you run on yourself, compared
        against your own history. Every figure is plain arithmetic on your readings, printed beside
        it. It is not a diagnosis and not clearance to throw. New or worsening pain, weakness or
        numbness needs qualified clinical review.
      </p>
    </article>
  );
}
