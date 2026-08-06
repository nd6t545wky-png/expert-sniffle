import { useState } from "react";
import { IsoDate } from "../../src/domain/state";
import { PlanState, SessionReport, submitSessionReport } from "../../src/domain/session";

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
}

export function Tracking({ date, plan, reports, onReport }: TrackingProps) {
  const [perceivedExertion, setPerceivedExertion] = useState(6);
  const [armFeel, setArmFeel] = useState(8);
  const [gamePitches, setGamePitches] = useState(0);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const existing = reports[date];
  const recent = Object.values(reports).filter(Boolean) as SessionReport[];

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
    <section className="card" aria-labelledby="tracking-heading">
      <h2 id="tracking-heading">Post-session report</h2>
      <p className="muted">{date}</p>

      {existing ? (
        <div className="alert" role="status">
          Reported: RPE {existing.perceivedExertion}, arm {existing.armFeel}/10.
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            Perceived exertion (1–10)
            <input
              type="range"
              min={1}
              max={10}
              value={perceivedExertion}
              onChange={(event) => setPerceivedExertion(Number(event.target.value))}
            />
            <output>{perceivedExertion}</output>
          </label>

          <label>
            Arm feel (1–10, higher is better)
            <input
              type="range"
              min={1}
              max={10}
              value={armFeel}
              onChange={(event) => setArmFeel(Number(event.target.value))}
            />
            <output>{armFeel}</output>
          </label>

          <label>
            Game pitches
            <input
              type="number"
              min={0}
              max={200}
              value={gamePitches}
              onChange={(event) => setGamePitches(Number(event.target.value))}
            />
          </label>

          <label>
            Notes
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>

          <button type="submit" className="btn">
            Submit report
          </button>
        </form>
      )}

      {error && (
        <div className="alert danger" role="alert">
          {error}
        </div>
      )}

      <h3>Recent sessions</h3>
      {recent.length === 0 ? (
        <p className="muted">No sessions reported yet.</p>
      ) : (
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
      )}
    </section>
  );
}
