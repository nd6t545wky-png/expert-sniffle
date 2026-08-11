import { useState } from "react";
import { IsoDate } from "../../src/domain/state";
import { PlanState, SessionReport, submitSessionReport } from "../../src/domain/session";
import { OuraTrendDay, ouraTrendDays } from "../../src/domain/healthTrends";
import { Alert, Card, EmptyState, PageHead } from "./Page";
import { SeriesSpec, TrendCard } from "./LineChart";
import { RangeField } from "./RangeField";
import { formatIsoDate } from "../state/formatDate";

/**
 * Post-session reporting and weekly tracking.
 *
 * One report per date — enforced in the domain layer, because a duplicate
 * would double-count that day in every workload figure downstream.
 */

export interface TrackingProps {
  date: IsoDate;
  plan: PlanState;
  reports: Record<IsoDate, SessionReport | undefined>;
  onReport: (report: SessionReport) => void;
  /** `state.healthPrefill` and `state.pre`, for the recovery trends. */
  healthPrefill?: Record<IsoDate, unknown>;
  submissions?: Record<IsoDate, unknown>;
}

/**
 * v60's six series, retitled for someone who has never worn an Oura ring.
 *
 * "HRV" and "SpO₂" name the sensor, not the thing measured. Each entry now
 * says what the number is, and which direction is the good one — which is not
 * guessable for stress minutes, where every other chart's "up" is this one's
 * bad news.
 */
const OURA_SERIES: SeriesSpec[] = [
  {
    key: "readiness",
    title: "Recovery score",
    explain: "Oura’s overall read on how recovered your body is today.",
    getter: (day) => day.readiness,
    higherIsBetter: true,
    scale: "out of 100",
    max: 100,
  },
  {
    key: "sleep",
    title: "Sleep quality",
    explain: "How well you slept, scored from time asleep, restfulness and timing.",
    getter: (day) => day.sleep,
    higherIsBetter: true,
    scale: "out of 100",
    max: 100,
  },
  {
    key: "hrv",
    title: "Overnight recovery",
    explain:
      "Heart-rate variability — the beat-to-beat variation while you sleep. It falls when you are under strain.",
    getter: (day) => day.hrv,
    higherIsBetter: true,
    unit: " ms",
  },
  {
    key: "stress",
    // Zero high-stress minutes is a real reading, and a good one — this is the
    // one series where dropping zeroes would hide the best days.
    title: "Time under stress",
    explain: "Minutes during the day your body showed a stress response.",
    getter: (day) => day.stress,
    higherIsBetter: false,
    allowZero: true,
    unit: " min",
  },
  {
    key: "activity",
    title: "Daily activity",
    explain: "How much you moved, scored against Oura’s daily target.",
    getter: (day) => day.activity,
    higherIsBetter: true,
    scale: "out of 100",
    max: 100,
  },
  {
    key: "spo2",
    title: "Blood oxygen",
    explain: "Average oxygen saturation overnight. It normally sits in the high nineties.",
    getter: (day) => day.spo2,
    higherIsBetter: true,
    unit: "%",
    precision: 1,
    max: 100,
  },
];

function OuraTrends({ days }: { days: OuraTrendDay[] }) {
  return (
    <details className="card disclosure-card quiet-disclosure">
      <summary>
        <span>
          <strong>Recovery trends</strong>
          <small>What your Oura ring has recorded</small>
        </span>
        <span>Show</span>
      </summary>
      <div className="disclosure-body">
        <p className="fineprint disclosure-intro">
          <strong>How to read these:</strong> each chart compares the latest reading against{" "}
          <em>your own</em> usual range — the shaded band — rather than against anyone else’s
          numbers. Days your ring did not sync stay blank; nothing here is estimated or filled in.
        </p>
        <section className="trend-grid">
          {OURA_SERIES.map((series) => (
            <TrendCard key={series.key} days={days} series={series} />
          ))}
        </section>
      </div>
    </details>
  );
}

export function Tracking({
  date,
  plan,
  reports,
  onReport,
  healthPrefill,
  submissions,
}: TrackingProps) {
  const [perceivedExertion, setPerceivedExertion] = useState(6);
  const [armFeel, setArmFeel] = useState(8);
  const [gamePitches, setGamePitches] = useState(0);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const existing = reports[date];
  const recent = Object.values(reports).filter(Boolean) as SessionReport[];
  const trendDays = ouraTrendDays(healthPrefill, submissions);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const outcome = submitSessionReport(reports, plan, {
      date,
      perceivedExertion,
      armFeel,
      gamePitches,
      notes,
    });
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    onReport(outcome.report);
  }

  return (
    <>
      <PageHead eyebrow="Progress" title="How did that go?" intro={formatIsoDate(date)} />

      {existing ? (
        <Alert>
          Reported: RPE {existing.perceivedExertion}, arm {existing.armFeel}/10.
        </Alert>
      ) : (
        // The prototype's check-out is a `.card.gate`, not a plain card: icon,
        // heading, explanation, then the form.
        <article className="card gate" id="post-card">
          <div className="gate-icon">✓</div>
          <h3>Plan resolved—check out</h3>
          <p>Record what actually happened.</p>

          <form id="post-form" className="form-grid" data-date={date} onSubmit={handleSubmit}>
            <RangeField
              name="rpe"
              label="Session RPE"
              min={1}
              max={10}
              help="1 very easy · 10 maximal"
              value={perceivedExertion}
              onChange={setPerceivedExertion}
            />

            <RangeField
              name="armFeel"
              label="Arm feel"
              min={1}
              max={10}
              help="1 poor · 10 excellent"
              value={armFeel}
              onChange={setArmFeel}
            />

            <div className="field">
              <label htmlFor="gamePitches">Game pitches</label>
              <input
                id="gamePitches"
                name="gamePitches"
                type="number"
                min={0}
                max={200}
                step={1}
                value={gamePitches}
                onChange={(event) => setGamePitches(Number(event.target.value))}
              />
            </div>

            <div className="field full">
              <label htmlFor="postNotes">Session notes</label>
              <textarea
                id="postNotes"
                name="notes"
                placeholder="Command, velocity, fatigue, changes, coach notes…"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-dark">
                Submit report
              </button>
            </div>
          </form>
        </article>
      )}

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}

      {recent.length === 0 ? (
        <EmptyState title="No sessions reported yet" detail="Reports appear here once you log one." />
      ) : (
        <Card>
        <table className="tracking-table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">RPE</th>
              <th scope="col">Arm</th>
              <th scope="col">Pitches</th>
            </tr>
          </thead>
          <tbody>
            {recent
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 14)
              .map((report) => (
                <tr key={report.date}>
                  <td>{report.date}</td>
                  <td>{report.perceivedExertion}</td>
                  <td>{report.armFeel}</td>
                  <td>{report.gamePitches ?? 0}</td>
                </tr>
              ))}
          </tbody>
        </table>
        </Card>
      )}

      <OuraTrends days={trendDays} />
    </>
  );
}
