/**
 * Blood work, read beside the training that produced it.
 *
 * The page has one job the pathology portal cannot do: put the numbers next to
 * what the week before the draw actually looked like. It has one job it must
 * refuse: telling the athlete what any of it means. Out-of-range values are
 * collected and pointed at a doctor; they are never explained here.
 */

import { useState } from "react";
import {
  BloodPanel,
  DrawContext,
  GROUP_LABELS,
  MARKERS,
  MarkerGroup,
  Reading,
  describeContext,
  formatRange,
  formatValue,
  needsReview,
  readPanel,
} from "../../src/domain/bloods";
import { IsoDate } from "../../src/domain/state";
import { Alert, Card, CardHead, PageHead } from "./Page";

export interface BloodsProps {
  panels: BloodPanel[];
  today: IsoDate;
  /** What the training week looked like around a given draw. */
  contextFor: (date: IsoDate) => DrawContext;
  onChange: (next: BloodPanel[]) => void;
}

const GROUPS = Object.keys(GROUP_LABELS) as MarkerGroup[];

const FLAG_LABEL: Record<Reading["flag"], string> = {
  "in-range": "In range",
  below: "Below range",
  above: "Above range",
  "expected-to-vary": "Expected to vary",
  "no-range": "No range",
};

const format = (date: string) =>
  new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00+10:00`));

function Row({ reading }: { reading: Reading }) {
  const { marker, result, flag, previous, change } = reading;
  return (
    <li className={`blood-row flag-${flag}`}>
      <div className="blood-name">
        <strong>{marker.label}</strong>
        <small>{marker.note}</small>
      </div>
      <div className="blood-value">
        <b>{formatValue(marker, result.value)}</b>
        {previous && change !== null && (
          <small>
            {change > 0 ? "+" : ""}
            {change} since {format(previous.date)}
          </small>
        )}
      </div>
      <div className="blood-range">
        <span>{formatRange(reading)}</span>
        <small>{reading.ownRange ? "your report" : "typical range"}</small>
      </div>
      <span className={`blood-flag flag-${flag}`}>{FLAG_LABEL[flag]}</span>
    </li>
  );
}

export function Bloods({ panels, today, contextFor, onChange }: BloodsProps) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [lab, setLab] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [ranges, setRanges] = useState<Record<string, { low: string; high: string }>>({});

  const latest = panels[0] ?? null;
  const readings = latest ? readPanel(latest, panels) : [];
  const review = needsReview(readings);
  const context = latest ? contextFor(latest.date) : null;

  function save() {
    const results: BloodPanel["results"] = {};
    for (const marker of MARKERS) {
      const value = Number(values[marker.id]);
      if (!Number.isFinite(value) || value <= 0) continue;
      const low = Number(ranges[marker.id]?.low);
      const high = Number(ranges[marker.id]?.high);
      results[marker.id] = {
        value,
        ...(Number.isFinite(low) && low >= 0 && ranges[marker.id]?.low !== "" ? { low } : {}),
        ...(Number.isFinite(high) && high > 0 && ranges[marker.id]?.high !== "" ? { high } : {}),
      };
    }
    if (Object.keys(results).length === 0) return;
    const kept = panels.filter((panel) => panel.date !== date);
    onChange([{ date, results, ...(lab.trim() ? { lab: lab.trim() } : {}) }, ...kept]);
    setValues({});
    setRanges({});
    setLab("");
    setOpen(false);
  }

  return (
    <>
      <PageHead
        eyebrow="Bloods"
        title="What the lab measured"
        intro="Your panel, kept beside the training week it was drawn in — because a result taken two days after a start is a different result from the same number on a rest day."
      />

      <Alert tone="info">
        <strong>This page does not read your results.</strong>
        <p>
          It records what the laboratory measured, compares each value against the reference range on
          your own report, and shows what you were doing that week. It does not interpret anything and
          it is not a substitute for the doctor who ordered the test. Anything outside range goes to
          them — take this page with you.
        </p>
      </Alert>

      {latest === null ? (
        <Card>
          <CardHead
            title="Nothing recorded yet"
            detail="Add a panel once you have a report in front of you. Enter the reference range printed beside each result too — ranges differ between laboratories, and yours beats any general figure."
          />
          <div className="form-actions">
            <button className="btn btn-dark" type="button" onClick={() => setOpen(true)}>
              Add a panel
            </button>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <CardHead
              title={`Drawn ${format(latest.date)}`}
              detail={latest.lab ? `${latest.lab} · ${readings.length} markers` : `${readings.length} markers`}
            />
            {context && <p className="blood-context">{describeContext(context)}</p>}
            {review.length > 0 && (
              <Alert tone="warn">
                <strong>
                  {review.length} {review.length === 1 ? "result is" : "results are"} outside the range on
                  your report
                </strong>
                <p>
                  {review.map((reading) => reading.marker.label).join(", ")}. That is a fact about the
                  numbers, not a diagnosis — book it in with your doctor rather than acting on it here.
                </p>
              </Alert>
            )}
          </Card>

          {GROUPS.map((group) => {
            const rows = readings.filter((reading) => reading.marker.group === group);
            if (rows.length === 0) return null;
            return (
              <Card key={group}>
                <CardHead title={GROUP_LABELS[group]} />
                <ul className="blood-list">
                  {rows.map((reading) => (
                    <Row key={reading.marker.id} reading={reading} />
                  ))}
                </ul>
              </Card>
            );
          })}

          {panels.length > 1 && (
            <Card>
              <CardHead title="Earlier panels" detail="Each one keeps the ranges that were printed with it." />
              <ul className="blood-history">
                {panels.slice(1).map((panel) => (
                  <li key={panel.date}>
                    <div>
                      <strong>{format(panel.date)}</strong>
                      <small>
                        {Object.keys(panel.results).length} markers
                        {panel.lab ? ` · ${panel.lab}` : ""}
                      </small>
                    </div>
                    <button
                      className="text-button danger-text"
                      type="button"
                      aria-label={`Remove the panel from ${format(panel.date)}`}
                      onClick={() => onChange(panels.filter((entry) => entry.date !== panel.date))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {!open && (
            <div className="form-actions">
              <button className="btn btn-dark" type="button" onClick={() => setOpen(true)}>
                Add a panel
              </button>
            </div>
          )}
        </>
      )}

      {open && (
        <Card>
          <CardHead
            title="Add a panel"
            detail="Leave anything the panel did not test blank. Enter the reference range printed beside each result — yours is the one that counts."
          />
          <div className="intent-grid">
            <div className="field">
              <label htmlFor="blood-date">Date of the draw</label>
              <input
                id="blood-date"
                type="date"
                value={date}
                onChange={(event) => setDate((event.target.value || today) as IsoDate)}
              />
              <small>The day blood was taken, not the day the report came back.</small>
            </div>
            <div className="field">
              <label htmlFor="blood-lab">Laboratory</label>
              <input
                id="blood-lab"
                type="text"
                maxLength={60}
                placeholder="QML, Sullivan Nicolaides…"
                value={lab}
                onChange={(event) => setLab(event.target.value)}
              />
              <small>Ranges differ between labs, so it is worth knowing which one.</small>
            </div>
          </div>

          {GROUPS.map((group) => (
            <div className="blood-entry-group" key={group}>
              <p className="blood-entry-head">{GROUP_LABELS[group]}</p>
              {MARKERS.filter((marker) => marker.group === group).map((marker) => (
                <div className="blood-entry" key={marker.id}>
                  <label htmlFor={`blood-${marker.id}`}>
                    {marker.label} <span>{marker.unit}</span>
                  </label>
                  <input
                    id={`blood-${marker.id}`}
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    placeholder="result"
                    value={values[marker.id] ?? ""}
                    onChange={(event) => setValues({ ...values, [marker.id]: event.target.value })}
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    aria-label={`${marker.label} range low`}
                    placeholder="low"
                    value={ranges[marker.id]?.low ?? ""}
                    onChange={(event) =>
                      setRanges({
                        ...ranges,
                        [marker.id]: { low: event.target.value, high: ranges[marker.id]?.high ?? "" },
                      })
                    }
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    aria-label={`${marker.label} range high`}
                    placeholder="high"
                    value={ranges[marker.id]?.high ?? ""}
                    onChange={(event) =>
                      setRanges({
                        ...ranges,
                        [marker.id]: { low: ranges[marker.id]?.low ?? "", high: event.target.value },
                      })
                    }
                  />
                </div>
              ))}
            </div>
          ))}

          <div className="form-actions">
            <button className="btn btn-dark" type="button" onClick={save}>
              Save panel
            </button>
            <button className="text-button" type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </Card>
      )}
    </>
  );
}
