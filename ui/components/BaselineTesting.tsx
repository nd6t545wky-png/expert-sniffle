import { useState } from "react";
import {
  AthleteBaseline,
  BASELINE_ANCHORS,
  BASELINE_RECOMMENDATIONS,
  BASELINE_SECTIONS,
} from "../../src/domain/baseline";
import { RETEST_METRICS } from "../../src/domain/retest";
import { strengthWindowKg } from "../../src/domain/programmeUpdates";
import { Card, CardHead, Disclosure } from "./Page";

/**
 * Measured baseline testing, on the athlete page.
 *
 * The anchors come first because those are the numbers the programme
 * actually computes from - the rest is the evidence behind them. Values the
 * reports themselves flagged as below target are marked, because a wall of
 * numbers with nothing distinguished is a wall of numbers.
 */
export function BaselineTesting() {
  const window = strengthWindowKg(BASELINE_ANCHORS.backSquat1RmKg)!;

  return (
    <>
      <Card>
        <CardHead title="Baseline testing" detail="Measured - the programme computes loads from these" />

        <div className="grid metrics">
          <article className="card metric">
            <span className="metric-label">Back squat 1RM</span>
            <div className="metric-value">{BASELINE_ANCHORS.backSquat1RmKg} kg</div>
            <div className="metric-detail">Tested, 5-set velocity profile</div>
          </article>
          <article className="card metric">
            <span className="metric-label">Strength window</span>
            <div className="metric-value">
              {window.low}–{window.high} kg
            </div>
            <div className="metric-detail">
              {BASELINE_ANCHORS.strengthPercentRange[0]}–{BASELINE_ANCHORS.strengthPercentRange[1]}% of 1RM
            </div>
          </article>
          <article className="card metric">
            <span className="metric-label">Power load</span>
            <div className="metric-value">{BASELINE_ANCHORS.optimalPowerLoadKg} kg</div>
            <div className="metric-detail">Optimal load for peak power</div>
          </article>
          <article className="card metric">
            <span className="metric-label">Measured BMR</span>
            <div className="metric-value">{BASELINE_ANCHORS.basalMetabolicRateKcal}</div>
            <div className="metric-detail">kcal/day, from DEXA lean mass</div>
          </article>
        </div>

        <p className="fineprint">
          These are measurements, not clearance to train. The DEXA report states its whole-body bone
          density is not for diagnostic use, and neither report replaces medical or coaching review.
        </p>
      </Card>

      {BASELINE_SECTIONS.map((section) => (
        <Disclosure
          key={section.title}
          title={section.title}
          detail={`${section.source} · ${section.measuredOn}`}
        >
          {section.note && <p className="fineprint">{section.note}</p>}
          <table className="tracking-table">
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col">Result</th>
                <th scope="col">Context</th>
              </tr>
            </thead>
            <tbody>
              {section.measures.map((measure) => (
                <tr key={measure.label}>
                  <td>{measure.label}</td>
                  <td>
                    <strong>{measure.value}</strong>
                  </td>
                  <td>
                    {measure.context}
                    {measure.flagged && (
                      <>
                        {" "}
                        <span className="status yellow">Flagged</span>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Disclosure>
      ))}

      <Disclosure title="What the reports recommended" detail="Traceable to the programme changes">
        <div className="mini-list">
          {BASELINE_RECOMMENDATIONS.map((item, index) => (
            <div className="mini-row" key={item.heading}>
              <span className="mini-icon">{index + 1}</span>
              <div>
                <strong>{item.heading}</strong>
                <p>{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Disclosure>
    </>
  );
}

/** What the athlete's baseline form saves: their numbers and their two maxes. */
export interface BaselineEntry {
  baseline: AthleteBaseline;
  backSquatKg: number | null;
  trapBarKg: number | null;
}

const BODY = [
  { id: "bodyMassKg", label: "Body mass", unit: "kg" },
  { id: "heightCm", label: "Height", unit: "cm" },
  { id: "bodyFatPercent", label: "Body fat (optional)", unit: "%" },
] as const;
const LIFTS = [
  { id: "backSquatKg", label: "Back squat 1RM", unit: "kg" },
  { id: "trapBarKg", label: "Trap bar deadlift 1RM", unit: "kg" },
] as const;
// The battery's loaded velocities need a max first, so they wait for a retest.
const TESTS = RETEST_METRICS.filter((metric) => !metric.id.startsWith("barVel"));

/**
 * The athlete's own baseline testing. Every field is theirs: nothing is
 * filled in, and whatever is left blank stays blank in the programme.
 */
export function AthleteBaselineForm({
  baseline,
  backSquatKg,
  trapBarKg,
  today,
  onSave,
}: {
  baseline: AthleteBaseline | null;
  backSquatKg: number | null;
  trapBarKg: number | null;
  today: string;
  onSave: (entry: BaselineEntry) => void;
}) {
  const start: Record<string, string> = {
    measuredOn: baseline?.measuredOn ?? today,
    bodyMassKg: String(baseline?.bodyMassKg ?? ""),
    heightCm: String(baseline?.heightCm ?? ""),
    bodyFatPercent: String(baseline?.bodyFatPercent ?? ""),
    backSquatKg: String(backSquatKg ?? ""),
    trapBarKg: String(trapBarKg ?? ""),
    ...Object.fromEntries(TESTS.map((metric) => [metric.id, String(baseline?.metrics[metric.id] ?? "")])),
  };
  const [draft, setDraft] = useState(start);
  const [saved, setSaved] = useState(false);
  const number = (id: string) => {
    const value = Number(draft[id]);
    return draft[id]?.trim() && Number.isFinite(value) && value > 0 ? value : undefined;
  };

  function save() {
    onSave({
      baseline: {
        measuredOn: draft.measuredOn || today,
        bodyMassKg: number("bodyMassKg"),
        heightCm: number("heightCm"),
        bodyFatPercent: number("bodyFatPercent"),
        metrics: Object.fromEntries(
          TESTS.map((metric) => [metric.id, number(metric.id)]).filter(([, value]) => value !== undefined)
        ),
      },
      backSquatKg: number("backSquatKg") ?? null,
      trapBarKg: number("trapBarKg") ?? null,
    });
    setSaved(true);
  }

  const field = (id: string, label: string, unit: string) => (
    <div className="field" key={id}>
      <label htmlFor={`baseline-${id}`}>
        {label}
        {unit ? ` (${unit})` : ""}
      </label>
      <input
        id={`baseline-${id}`}
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        value={draft[id] ?? ""}
        onChange={(event) => {
          setSaved(false);
          setDraft({ ...draft, [id]: event.target.value });
        }}
      />
    </div>
  );

  return (
    <Card>
      <CardHead
        title="Your baseline testing"
        detail="Your loads, food targets and retest progress are worked out from these. Leave out anything you have not measured."
      />
      <div className="intent-grid">
        <div className="field">
          <label htmlFor="baseline-measuredOn">Tested on</label>
          <input
            id="baseline-measuredOn"
            type="date"
            value={draft.measuredOn}
            onChange={(event) => setDraft({ ...draft, measuredOn: event.target.value })}
          />
        </div>
        {BODY.map((item) => field(item.id, item.label, item.unit))}
        {LIFTS.map((item) => field(item.id, item.label, item.unit))}
        {TESTS.map((metric) => field(metric.id, metric.label, metric.unit))}
      </div>
      <div className="form-actions">
        <button className="btn btn-dark" type="button" onClick={save}>
          Save baseline
        </button>
        {saved && <span className="fineprint">Saved. The programme now uses these.</span>}
      </div>
    </Card>
  );
}
