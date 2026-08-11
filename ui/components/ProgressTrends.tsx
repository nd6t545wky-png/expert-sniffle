import { ChartGeometry, seriesGeometry } from "../../src/domain/healthTrends";
import {
  ProgressSummary,
  ProgressVerdict,
  TrendPoint,
  summariseProgress,
} from "../../src/domain/progressTrends";
import { TrendPlot, round, shortDate } from "./LineChart";
import { ChartEmpty } from "./Page";

/**
 * Is the training working?
 *
 * The recovery trends answer "is today normal for me", against a rolling
 * fortnight. These answer a different question over a longer window — did the
 * number move since the day this started — so they are framed differently:
 *
 *   - The hero is the latest measurement, as before.
 *   - The verdict compares against *where the athlete started*, not against a
 *     usual range. On a season of squats every recent session sits above the
 *     middle half of the earlier ones, so a usual-range verdict would read
 *     "better than usual" forever and mean nothing.
 *   - The high-water mark is called out by name, because "have I beaten it"
 *     is the question anyone actually asks of a strength chart.
 *
 * No shaded band: there is no usual range here, and drawing one would invite
 * the reader to compare a season's progression against its own middle, which
 * says nothing about whether the programme worked.
 */

export interface ProgressSpec {
  key: string;
  /** Plain English, and specific — "Back squat", not "Lower body". */
  title: string;
  /** What the number is, for a reader who has not met it before. */
  explain: string;
  points: TrendPoint[];
  /** null where neither direction is good news — bodyweight. */
  higherIsBetter?: boolean | null;
  unit?: string;
  precision?: number;
}

const VERDICT_COPY: Record<ProgressVerdict, { label: string; glyph: string }> = {
  best: { label: "Best on record", glyph: "▲" },
  up: { label: "Up on where you started", glyph: "▲" },
  level: { label: "Holding steady", glyph: "—" },
  down: { label: "Down on where you started", glyph: "▼" },
};

/**
 * The verdict, as a word plus an arrow plus a tint — never the tint alone.
 *
 * `down` is intentionally not tinted as a warning here. Bodyweight coming down
 * may be the goal, and a squat off its best by 2 kg in a deload week is the
 * plan working. The word states the fact; the reader supplies the meaning.
 */
function VerdictPill({ verdict }: { verdict: ProgressVerdict }) {
  const { label, glyph } = VERDICT_COPY[verdict];
  return (
    <span className={`trend-verdict is-progress-${verdict}`}>
      <span aria-hidden="true">{glyph}</span>
      {label}
    </span>
  );
}

/** "+7.5 kg since 3 Mar", or the honest "no change" when there is none. */
function changeLine(summary: ProgressSummary, spec: ProgressSpec): string {
  const unit = spec.unit ?? "";
  const precision = spec.precision ?? 0;
  const since = `since ${shortDate(summary.first.date)}`;
  if (summary.change === 0) return `no change ${since}`;
  const sign = summary.change > 0 ? "+" : "−";
  return `${sign}${round(Math.abs(summary.change), precision)}${unit} ${since}`;
}

export function ProgressCard({ spec }: { spec: ProgressSpec }) {
  const summary = summariseProgress(spec.points, { higherIsBetter: spec.higherIsBetter });
  const geometry: ChartGeometry | null = seriesGeometry(spec.points);
  const precision = spec.precision ?? 0;

  return (
    <article className="trend-card">
      <header className="trend-head">
        <div>
          <h3>{spec.title}</h3>
          <p>{spec.explain}</p>
        </div>
        {summary && <VerdictPill verdict={summary.verdict} />}
      </header>

      {!summary || !geometry ? (
        <ChartEmpty
          title={`No ${spec.title.toLowerCase()} history yet`}
          detail="This fills in once there are two sessions to compare."
        />
      ) : (
        <>
          <p className="trend-value">
            <strong>
              {round(summary.latest.value, precision)}
              {spec.unit ? <span className="trend-unit">{spec.unit}</span> : null}
            </strong>
            <span className="trend-caption">
              {shortDate(summary.latest.date)} · {changeLine(summary, spec)} ·{" "}
              {summary.sessions} sessions
            </span>
          </p>

          <TrendPlot
            geometry={geometry}
            title={spec.title}
            unit={spec.unit}
            precision={precision}
            tone={`progress-${summary.verdict}`}
            best={
              // Bodyweight has no "best", so nothing is rung on it.
              spec.higherIsBetter === null || spec.higherIsBetter === undefined
                ? null
                : (geometry.points.find((point) => point.date === summary.best.date) ?? null)
            }
            tableNote={
              spec.higherIsBetter !== null && spec.higherIsBetter !== undefined ? (
                <p className="fineprint">
                  Best on record: {round(summary.best.value, precision)}
                  {spec.unit ?? ""} on {shortDate(summary.best.date)}.
                </p>
              ) : null
            }
          />
        </>
      )}
    </article>
  );
}

export function ProgressTrends({ specs }: { specs: ProgressSpec[] }) {
  if (specs.length === 0) return null;

  return (
    <details className="card disclosure-card quiet-disclosure">
      <summary>
        <span>
          <strong>Training trends</strong>
          <small>Whether the work is moving the numbers</small>
        </span>
        <span>Show</span>
      </summary>
      <div className="disclosure-body">
        <p className="fineprint disclosure-intro">
          <strong>How to read these:</strong> each chart plots what you actually logged, one point
          per session, against where you started. Nothing is estimated between points — a gap is a
          gap. Strength figures are <em>estimated</em> one-rep maxes worked back from the reps and
          load you recorded, not maxes you lifted.
        </p>
        <section className="trend-grid">
          {specs.map((spec) => (
            <ProgressCard key={spec.key} spec={spec} />
          ))}
        </section>
      </div>
    </details>
  );
}
