import { useState } from "react";
import { IsoDate } from "../../src/domain/state";
import { PlanState, SessionReport, submitSessionReport } from "../../src/domain/session";
import { Alert, Card, EmptyState, Field, PageHead } from "./Page";

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
    <>
      <PageHead eyebrow="Progress" title="How did that go?" intro={date} />

      {existing ? (
        <Alert>
          Reported: RPE {existing.perceivedExertion}, arm {existing.armFeel}/10.
        </Alert>
      ) : (
        <Card>
          <form className="form-grid" onSubmit={handleSubmit}>
            <Field id="rpe" label="Perceived exertion" hint={`${perceivedExertion} of 10`}>
              <input
                id="rpe"
                type="range"
                min={1}
                max={10}
                value={perceivedExertion}
                onChange={(event) => setPerceivedExertion(Number(event.target.value))}
              />
            </Field>

            <Field id="armFeel" label="Arm feel" hint={`${armFeel} of 10 — higher is better`}>
              <input
                id="armFeel"
                type="range"
                min={1}
                max={10}
                value={armFeel}
                onChange={(event) => setArmFeel(Number(event.target.value))}
              />
            </Field>

            <Field id="gamePitches" label="Game pitches">
              <input
                id="gamePitches"
                type="number"
                min={0}
                max={200}
                value={gamePitches}
                onChange={(event) => setGamePitches(Number(event.target.value))}
              />
            </Field>

            <Field id="notes" label="Notes" full>
              <textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>

            <div className="form-actions">
              <button type="submit" className="btn btn-dark">
                Submit report
              </button>
            </div>
          </form>
        </Card>
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
    </>
  );
}
