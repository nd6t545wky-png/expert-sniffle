import { useRef, useState } from "react";
import { IsoDate } from "../../src/domain/state";
import {
  ImportResult,
  Pitch,
  SOURCE_LABEL,
  normalisePitchType,
  parsePitchCsv,
  pitchTypeSummaries,
  topVelocity,
} from "../../src/domain/pitchLog";
import { Alert, EmptyState } from "./Page";

/**
 * Ball flight — the one category the app had nothing for.
 *
 * Two ways in, both landing in the same record: a CSV exported from Rapsodo,
 * TrackMan or Pocket Radar, or typed by hand off a radar gun.
 *
 * The import deliberately reports what it *could not* read. A quiet partial
 * import is a bullpen that looks lighter than it was, and the athlete has no
 * way to notice.
 */

export interface PitchDataProps {
  date: IsoDate;
  pitches: Pitch[];
  onImport: (pitches: Pitch[]) => void;
  onAdd: (pitch: Pitch) => void;
  onRemove: (id: string) => void;
}

const PITCH_TYPES = [
  "Fastball",
  "Sinker",
  "Cutter",
  "Slider",
  "Sweeper",
  "Curveball",
  "Changeup",
  "Splitter",
];

/** Field keys as an athlete would name them, for the import report. */
const FIELD_LABELS: Record<string, string> = {
  pitchType: "pitch type",
  velocityMph: "speed",
  spinRpm: "spin",
  spinEfficiencyPct: "spin efficiency",
  inducedVertBreakIn: "vertical break",
  horzBreakIn: "horizontal break",
  releaseHeightFt: "release height",
  releaseSideFt: "release side",
  extensionFt: "extension",
};

function FIELD_NAMES(fields: string[]): string {
  const named = fields.map((field) => FIELD_LABELS[field] ?? field);
  if (named.length === 1) return named[0];
  return `${named.slice(0, -1).join(", ")} or ${named[named.length - 1]}`;
}

function num(value: number | null, unit = "", places = 0): string {
  return value === null ? "—" : `${value.toFixed(places)}${unit}`;
}

export function PitchData({ date, pitches, onImport, onAdd, onRemove }: PitchDataProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ pitchType: "Fastball", velocity: "", spin: "" });

  const summaries = pitchTypeSummaries(pitches);
  const best = topVelocity(pitches);

  async function handleFile(file: File) {
    setError("");
    setReport(null);
    try {
      const result = parsePitchCsv(await file.text(), date);
      setReport(result);
      if (result.pitches.length) onImport(result.pitches);
    } catch {
      setError("That file could not be read. A .csv exported from the device is what this expects.");
    }
  }

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const velocity = Number(draft.velocity);
    if (!Number.isFinite(velocity) || velocity <= 0) {
      setError("Enter the pitch speed in mph.");
      return;
    }
    onAdd({
      id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      date,
      pitchType: normalisePitchType(draft.pitchType),
      velocityMph: velocity,
      spinRpm: draft.spin ? Number(draft.spin) : null,
      spinEfficiencyPct: null,
      inducedVertBreakIn: null,
      horzBreakIn: null,
      releaseHeightFt: null,
      releaseSideFt: null,
      extensionFt: null,
      source: "manual",
    });
    setDraft((current) => ({ ...current, velocity: "", spin: "" }));
  }

  return (
    <article className="card card-pad">
      <div className="card-head">
        <div>
          <h3>Pitch data</h3>
          <p>Velocity, spin and break — imported from your device, or typed in.</p>
        </div>
      </div>

      <div className="pitch-import">
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept=".csv,text/csv"
          aria-label="Pitch data CSV"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = "";
          }}
        />
        <button className="btn btn-dark" type="button" onClick={() => fileInput.current?.click()}>
          Import a CSV
        </button>
        <span>Rapsodo · TrackMan · Pocket Radar</span>
      </div>

      {report && (
        <Alert tone={report.pitches.length ? "info" : "warn"} role="status">
          <strong>
            {report.pitches.length
              ? `Imported ${report.pitches.length} ${report.pitches.length === 1 ? "pitch" : "pitches"} from ${SOURCE_LABEL[report.source]}`
              : "Nothing imported"}
          </strong>
          {report.skipped.length > 0 && (
            <>
              {report.skipped.length} row{report.skipped.length === 1 ? "" : "s"} skipped:{" "}
              {report.skipped
                .slice(0, 3)
                .map((row) => `line ${row.line} — ${row.reason}`)
                .join("; ")}
              {report.skipped.length > 3 ? ` and ${report.skipped.length - 3} more. ` : ". "}
            </>
          )}
          {report.pitches.length > 0 && report.missingFields.length > 0 && (
            <>
              This export did not include {FIELD_NAMES(report.missingFields)}. Those stay empty
              rather than being filled with zeroes.
            </>
          )}
        </Alert>
      )}

      {error && (
        <Alert tone="warn" role="alert">
          {error}
        </Alert>
      )}

      {best && (
        <p className="pitch-best">
          <span>Top velocity</span>
          <strong>{best.mph.toFixed(1)} mph</strong>
          <small>{best.pitchType}</small>
        </p>
      )}

      {summaries.length === 0 ? (
        <EmptyState
          title="No pitch data for this day"
          detail="Import a CSV from your device, or add a reading by hand below."
        />
      ) : (
        <div className="scroll-x">
          <table className="pitch-table">
            <thead>
              <tr>
                <th scope="col">Pitch</th>
                <th scope="col">No.</th>
                <th scope="col">Avg</th>
                <th scope="col">Max</th>
                <th scope="col">Spin</th>
                <th scope="col">IVB</th>
                <th scope="col">HB</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((row) => (
                <tr key={row.pitchType}>
                  <td>{row.pitchType}</td>
                  <td>{row.count}</td>
                  <td>{row.avgVelocity.toFixed(1)}</td>
                  <td>{row.maxVelocity.toFixed(1)}</td>
                  <td>{num(row.avgSpin)}</td>
                  <td>{num(row.avgInducedVertBreak, '"', 1)}</td>
                  <td>{num(row.avgHorzBreak, '"', 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="pitch-add" onSubmit={handleAdd}>
        <div className="field">
          <label htmlFor="pitchType">Pitch</label>
          <select
            id="pitchType"
            value={draft.pitchType}
            onChange={(event) => setDraft((c) => ({ ...c, pitchType: event.target.value }))}
          >
            {PITCH_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pitchVelocity">Speed</label>
          <input
            id="pitchVelocity"
            type="number"
            min={0}
            max={130}
            step={0.1}
            inputMode="decimal"
            placeholder="mph"
            value={draft.velocity}
            onChange={(event) => setDraft((c) => ({ ...c, velocity: event.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="pitchSpin">Spin</label>
          <input
            id="pitchSpin"
            type="number"
            min={0}
            max={4000}
            step={10}
            inputMode="numeric"
            placeholder="rpm"
            value={draft.spin}
            onChange={(event) => setDraft((c) => ({ ...c, spin: event.target.value }))}
          />
        </div>
        <div className="form-actions">
          <button className="btn btn-outline" type="submit">
            Add pitch
          </button>
        </div>
      </form>

      {pitches.length > 0 && (
        <details className="pitch-list">
          <summary>Every pitch ({pitches.length})</summary>
          <div className="scroll-x">
            <table className="pitch-table">
              <thead>
                <tr>
                  <th scope="col">Pitch</th>
                  <th scope="col">mph</th>
                  <th scope="col">rpm</th>
                  <th scope="col">Source</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                {pitches.map((pitch) => (
                  <tr key={pitch.id}>
                    <td>{pitch.pitchType || "Untagged"}</td>
                    <td>{pitch.velocityMph?.toFixed(1) ?? "—"}</td>
                    <td>{pitch.spinRpm ?? "—"}</td>
                    <td>{SOURCE_LABEL[pitch.source]}</td>
                    <td>
                      <button
                        className="text-button danger-text"
                        type="button"
                        aria-label={`Remove ${pitch.pitchType || "pitch"} at ${pitch.velocityMph} mph`}
                        onClick={() => onRemove(pitch.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <p className="fineprint">
        Exports are read by column name, so a renamed file still works. Rows the importer cannot read
        are listed rather than dropped — a partial import you did not notice is worse than a failed one.
      </p>
    </article>
  );
}
