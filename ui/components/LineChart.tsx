import { ReactNode } from "react";
import {
  CHART,
  ChartGeometry,
  ChartPoint,
  MetricSummary,
  OuraTrendDay,
  Verdict,
  chartGeometry,
  summariseMetric,
} from "../../src/domain/healthTrends";
import { ChartEmpty } from "./Page";
import { formatIsoDate } from "../state/formatDate";

/**
 * One metric, written so someone who has never seen an Oura ring can read it.
 *
 * v60 drew a bare line on an unlabelled axis and titled it "HRV". That is
 * legible only to a reader who already knows what a good HRV is — which is
 * the one reader who did not need the chart. Four things fix that, and they
 * are the reason this component is more than an SVG:
 *
 *   1. A plain title and a sentence saying what the number means and which
 *      direction is good. "Higher is better" is not obvious for stress minutes.
 *   2. The latest value, large, with its unit — the answer to "how am I doing"
 *      is a number, not a shape.
 *   3. A verdict against the athlete's *own* usual range, in words. There is
 *      no universal good HRV; there is only whether today is normal for you.
 *   4. A shaded band showing that usual range on the chart, so a point above
 *      or below it reads instantly without consulting the axis.
 *
 * Colour is never the only channel. The verdict carries a word and an arrow;
 * the tint behind it is redundant. Checked against the palette validator: the
 * app's green and amber sit at ΔE 5.1 under protanopia and below 3:1 contrast
 * on white, so neither can be trusted to say anything on its own.
 */

export interface SeriesSpec {
  key: string;
  /** Plain English — "Recovery score", not "Oura readiness". */
  title: string;
  /** What the number means, for someone who has never seen it before. */
  explain: string;
  getter: (day: OuraTrendDay) => number | null;
  higherIsBetter: boolean;
  /** True where zero is a real reading, e.g. high-stress minutes. */
  allowZero?: boolean;
  unit?: string;
  /** Appended after the value, e.g. "out of 100". */
  scale?: string;
  /** Hard ceiling for the y-axis, where the metric has one. */
  max?: number;
  /** Decimal places for the displayed value. */
  precision?: number;
}

const VERDICT_COPY: Record<Verdict, { label: string; glyph: string }> = {
  better: { label: "Better than usual", glyph: "▲" },
  worse: { label: "Worse than usual", glyph: "▼" },
  normal: { label: "Normal for you", glyph: "—" },
  unknown: { label: "Building your normal", glyph: "·" },
};

export function round(value: number, precision = 0): string {
  return value.toFixed(precision);
}

export function shortDate(date: string): string {
  return formatIsoDate(date, { day: "numeric", month: "short" });
}

/**
 * The verdict, as a word plus an arrow plus a tint.
 *
 * Never the tint alone: a red/amber/green trio is indistinguishable to a
 * protanope, so the sentence has to survive the colour being ignored entirely.
 */
function VerdictPill({ verdict }: { verdict: Verdict }) {
  const { label, glyph } = VERDICT_COPY[verdict];
  return (
    <span className={`trend-verdict is-${verdict}`}>
      <span aria-hidden="true">{glyph}</span>
      {label}
    </span>
  );
}

export function TrendCard({ days, series }: { days: OuraTrendDay[]; series: SeriesSpec }) {
  const summary: MetricSummary = summariseMetric(days, series.getter, {
    higherIsBetter: series.higherIsBetter,
    allowZero: series.allowZero,
  });
  const geometry: ChartGeometry | null = chartGeometry(days, series.getter, {
    allowZero: series.allowZero,
    usual: summary.usual,
    max: series.max,
  });

  const direction = series.higherIsBetter ? "Higher is better." : "Lower is better.";

  return (
    <article className="trend-card">
      <header className="trend-head">
        <div>
          <h3>{series.title}</h3>
          <p>
            {series.explain} {direction}
          </p>
        </div>
        {summary.latest !== null && <VerdictPill verdict={summary.verdict} />}
      </header>

      {summary.latest === null ? (
        <ChartEmpty
          title={`No ${series.title.toLowerCase()} yet`}
          detail="This fills in once your ring has synced a few days."
        />
      ) : (
        <>
          <p className="trend-value">
            <strong>
              {round(summary.latest, series.precision ?? 0)}
              {series.unit ? <span className="trend-unit">{series.unit}</span> : null}
            </strong>
            <span className="trend-caption">
              {series.scale ? `${series.scale} · ` : ""}
              {shortDate(summary.latestDate!)}
              {summary.usual
                ? ` · you usually sit ${round(summary.usual.low, series.precision ?? 0)}–${round(
                    summary.usual.high,
                    series.precision ?? 0
                  )}${series.unit ?? ""}`
                : ` · ${summary.observations} of ${5} days recorded`}
            </span>
          </p>

          {geometry && (
            <TrendPlot
              geometry={geometry}
              title={series.title}
              unit={series.unit}
              precision={series.precision}
              tone={summary.verdict}
              tableNote={
                summary.usual ? (
                  <p className="fineprint">
                    Your usual range is the middle half of the {summary.observations} days before
                    this one.
                  </p>
                ) : null
              }
            />
          )}
        </>
      )}
    </article>
  );
}

/**
 * The chart itself: axis, line, marks, and the table that carries every value.
 *
 * Shared by the recovery trends and the training trends. The two cards say
 * different things above it — "worse than usual" against a rolling normal, and
 * "personal best" against a season — but the drawing is the same drawing, and
 * one implementation means one place where a scaling bug can live.
 */
export function TrendPlot({
  geometry,
  title,
  unit,
  precision: precisionOption,
  tone,
  best,
  tableNote,
}: {
  geometry: ChartGeometry;
  title: string;
  unit?: string;
  precision?: number;
  /** Class suffix on the latest marker — the one mark that carries colour. */
  tone: string;
  /** High-water mark to ring, where the series has one worth naming. */
  best?: ChartPoint | null;
  tableNote?: ReactNode;
}) {
  const { points, path, ticks, band, plotLeft, plotRight, axisY } = geometry;
  const last = points[points.length - 1];
  const precision = precisionOption ?? 0;
  // Ringing the latest point as well would put two marks on one dot; when the
  // latest *is* the best, the verdict pill already says so.
  const bestMark = best && best.date !== last.date ? best : null;

  // The end label goes on the side the line does *not* arrive from.
  //
  // Sitting it above by default put "88.2 kg" straight through the bodyweight
  // line: the label extends back to the left of the last point, which is
  // exactly where a descending final segment is. Falling back to the other
  // side keeps it inside the box when the point is near the floor or ceiling.
  const previous = points[points.length - 2];
  const arrivesFromAbove = previous ? previous.y < last.y : false;
  const above = last.y - 11;
  const below = last.y + 17;
  const labelY = arrivesFromAbove
    ? below < axisY - 4
      ? below
      : above
    : above > CHART.top + 4
      ? above
      : below;

  return (
    <figure className="trend-chart">
      <svg
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        role="img"
        aria-label={`${title} over the last ${points.length} recorded days`}
      >
        {/* The athlete's usual range, behind everything. A point outside this
            band is the whole message of the chart, so the band is a neutral
            wash — it must not compete with the one mark that carries meaning. */}
        {band && (
          <rect
            className="trend-band"
            x={plotLeft}
            y={band.top}
            width={plotRight - plotLeft}
            height={Math.max(band.bottom - band.top, 1)}
          />
        )}

        {/* Solid hairline gridlines, one shade off the surface — never dashed. */}
        {ticks.map((tick) => (
          <g key={tick.value}>
            <line className="trend-gridline" x1={plotLeft} y1={tick.y} x2={plotRight} y2={tick.y} />
            <text className="trend-tick" x={plotLeft - 6} y={tick.y + 4} textAnchor="end">
              {round(tick.value, precision)}
            </text>
          </g>
        ))}

        {/* The line is neutral ink on purpose. Under the team themes the app's
            accent resolves to red, and a red line drawn across good news reads
            as an alarm. Colour on this card means exactly one thing: the
            verdict. */}
        <path className="trend-line" d={path} />

        {/* Only the latest point gets a marker, coloured by what it means. A
            dot on all twenty-one points is noise, and the table below carries
            every value anyway. */}
        <circle className={`trend-dot is-${tone}`} cx={last.x} cy={last.y} r={5} />

        {/* The high-water mark, as a hollow ring plus the word. Never the ring
            alone: an unlabelled second marker is a mystery, and a reader who
            cannot see the colour difference has nothing left to read. */}
        {bestMark && (
          <>
            <circle className="trend-best" cx={bestMark.x} cy={bestMark.y} r={4.5} />
            <text
              className="trend-bestlabel"
              x={bestMark.x}
              y={bestMark.y > CHART.top + 18 ? bestMark.y - 10 : bestMark.y + 18}
              textAnchor="middle"
            >
              best
            </text>
          </>
        )}

        {/* Nudged clear of the marker — anchored flush to it, the halo and the
            dot sat on top of each other. */}
        <text
          className="trend-endlabel"
          x={points.length > 1 ? last.x - 9 : last.x}
          y={labelY}
          textAnchor={points.length > 1 ? "end" : "middle"}
        >
          {round(last.value, precision)}
          {unit ?? ""}
        </text>

        {/* Invisible, generous hover targets — the visible marks are too small
            to land on, and a tooltip must never be the only way to read a
            value, so these only supplement the table. */}
        {points.map((point) => (
          <circle key={point.date} className="trend-hit" cx={point.x} cy={point.y} r={9}>
            <title>{`${shortDate(point.date)}: ${round(point.value, precision)}${unit ?? ""}`}</title>
          </circle>
        ))}

        <line className="trend-axis" x1={plotLeft} y1={axisY} x2={plotRight} y2={axisY} />
        <text className="trend-date" x={plotLeft} y={CHART.height - 8}>
          {shortDate(points[0].date)}
        </text>
        {points.length > 1 && (
          <text className="trend-date" x={plotRight} y={CHART.height - 8} textAnchor="end">
            {shortDate(last.date)}
          </text>
        )}
      </svg>

      {band && (
        <p className="trend-key">
          <span className="trend-key-band" aria-hidden="true" /> shaded band = your usual range
        </p>
      )}

      {/* Every value stays reachable without hovering or seeing colour. */}
      <details className="trend-table">
        <summary>See the numbers</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">{title}</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((point) => (
              <tr key={point.date}>
                <td>{shortDate(point.date)}</td>
                <td>
                  {round(point.value, precision)}
                  {unit ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tableNote}
      </details>
    </figure>
  );
}
