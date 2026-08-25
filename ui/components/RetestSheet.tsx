/**
 * The retest, entered and read back.
 *
 * The baseline screen has shown April's force-plate report since it was built
 * and offered no way to add a second column, so every number the programme is
 * aimed at has been frozen for four months. This is the second column — and
 * the third, and the tenth.
 *
 * It reports distance rather than pass or fail. The constraint profile is
 * explicit that its figures are directional targets, so a reading short of one
 * is shown as how far there is to go, never as a failure. And it always shows
 * the change against April beside the raw number, because on these metrics the
 * absolute value means little without knowing which way it moved.
 */

import { useState } from "react";
import {
  RETEST_METRICS,
  RetestEntry,
  formatMetric,
  isRetestWeek,
  nextRetestWeek,
  readings,
} from "../../src/domain/retest";
import { IsoDate } from "../../src/domain/state";
import { Card, CardHead } from "./Page";

export interface RetestSheetProps {
  entries: RetestEntry[];
  today: IsoDate;
  /** The programme week being viewed, so the card can say when the next one is. */
  week: number | null;
  onChange: (next: RetestEntry[]) => void;
}

export function RetestSheet({ entries, today, week, onChange }: RetestSheetProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const rows = readings(entries);
  const due = isRetestWeek(week);

  function save() {
    const values: Record<string, number> = {};
    for (const [id, raw] of Object.entries(draft)) {
      const value = Number(raw);
      if (Number.isFinite(value) && value > 0) values[id] = value;
    }
    if (Object.keys(values).length === 0) return;
    // Same date replaces, so a correction is an edit rather than a second
    // reading of the same morning.
    const kept = entries.filter((entry) => entry.date !== today);
    onChange([{ date: today, values }, ...kept]);
    setDraft({});
    setOpen(false);
  }

  return (
    <Card>
      <CardHead
        title="Retest battery"
        detail={
          due
            ? "This is a retest week. The battery is on Monday's plan, ahead of the lift."
            : `Every third week. Next one is week ${nextRetestWeek((week ?? 1) + 1)}.`
        }
      />

      <div className="retest-scroll">
        <table className="retest-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>April</th>
              <th>Latest</th>
              <th>Change</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ metric, latest, latestOn, improvement, toTarget, metTarget, metStretch }) => (
              <tr key={metric.id}>
                <td>
                  <strong>{metric.label}</strong>
                  {latestOn && <small>measured {latestOn}</small>}
                </td>
                <td className="retest-num">
                  {metric.baseline === null ? "—" : formatMetric(metric, metric.baseline)}
                </td>
                <td className="retest-num">
                  {latest === null ? <span className="retest-none">not yet</span> : formatMetric(metric, latest)}
                </td>
                <td className="retest-num">
                  {improvement === null ? (
                    "—"
                  ) : (
                    <span className={`retest-delta ${improvement > 0 ? "up" : improvement < 0 ? "down" : ""}`}>
                      {improvement > 0 ? "+" : ""}
                      {improvement}
                    </span>
                  )}
                </td>
                <td className="retest-num">
                  {metric.target === null ? (
                    <span className="retest-none">baseline</span>
                  ) : metStretch ? (
                    <span className="retest-hit">both met</span>
                  ) : metTarget ? (
                    <span className="retest-hit">met{metric.stretch ? ` · next ${metric.stretch}` : ""}</span>
                  ) : toTarget === null ? (
                    formatMetric(metric, metric.target)
                  ) : (
                    <>
                      {formatMetric(metric, metric.target)} <small>{toTarget} to go</small>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!open ? (
        <div className="form-actions">
          <button className="btn btn-dark" type="button" onClick={() => setOpen(true)}>
            Enter today&rsquo;s numbers
          </button>
        </div>
      ) : (
        <div className="retest-form">
          <p className="recovery-caveat">
            Leave anything you did not measure blank. A partial retest is worth far more than a
            skipped one, and a blank is honest in a way a guess is not.
          </p>
          <div className="intent-grid">
            {RETEST_METRICS.map((metric) => (
              <div className="field" key={metric.id}>
                <label htmlFor={`retest-${metric.id}`}>
                  {metric.label}
                  {metric.unit ? ` (${metric.unit})` : ""}
                </label>
                <input
                  id={`retest-${metric.id}`}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  value={draft[metric.id] ?? ""}
                  onChange={(event) => setDraft({ ...draft, [metric.id]: event.target.value })}
                />
                <small>{metric.how}</small>
              </div>
            ))}
          </div>
          <div className="form-actions">
            <button className="btn btn-dark" type="button" onClick={save}>
              Save {today}
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setDraft({});
                setOpen(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
