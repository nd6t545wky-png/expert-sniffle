/**
 * Oura's own numbers over time, and the geometry to draw them.
 *
 * v60 had a recovery-trends view built straight off the imported ring data;
 * the rebuild dropped it. This is the port, split so that the part worth
 * testing — which days have data, and where the points land — is pure, and the
 * component is left with nothing but the SVG.
 *
 * The stance v60 took, and this keeps: these charts show Oura fields only.
 * A day the ring did not sync stays blank rather than being interpolated,
 * because a filled-in gap reads as a measurement that was never taken.
 */

import { HealthSummary } from "./api";
import { HealthPrefillRecord, readPrefill } from "./healthPrefill";
import { IsoDate } from "./state";

export interface OuraTrendDay {
  date: IsoDate;
  readiness: number | null;
  sleep: number | null;
  activity: number | null;
  stress: number | null;
  recovery: number | null;
  spo2: number | null;
  hrv: number | null;
  restingHeartRate: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick(...candidates: unknown[]): number | null {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === "") continue;
    const value = Number(candidate);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

/**
 * One row per date the app knows anything about, oldest first.
 *
 * Values come from the imported ring payload, falling back to whatever a
 * check-in recorded for the same metric — so a day that was answered manually
 * before the import existed still contributes its point.
 */
export function ouraTrendDays(
  healthPrefill: Record<string, unknown> | undefined,
  pre: Record<string, unknown> | undefined
): OuraTrendDay[] {
  const dates = [
    ...new Set([...Object.keys(healthPrefill ?? {}), ...Object.keys(pre ?? {})]),
  ].sort();

  return dates.map((date) => {
    const record: HealthPrefillRecord = readPrefill(healthPrefill, date);
    const imported: Record<string, unknown> = isRecord(record.sources?.oura?.data)
      ? (record.sources!.oura!.data as unknown as Record<string, unknown>)
      : {};
    const merged: Record<string, unknown> = isRecord(record.merged)
      ? (record.merged as unknown as Record<string, unknown>)
      : {};
    const entry = isRecord(pre?.[date]) ? (pre![date] as Record<string, unknown>) : {};
    // Check-ins now nest their answers under `inputs`; older ones stored the
    // score alone. Both are read so no historical day is silently dropped.
    const inputs = isRecord(entry.inputs) ? entry.inputs : entry;

    return {
      date,
      readiness: pick(imported.readinessScore, merged.readinessScore, inputs.ouraReadinessScore),
      sleep: pick(imported.sleepScore, merged.sleepScore, inputs.sleepScore),
      activity: pick(imported.activityScore, inputs.ouraActivityScore),
      stress: pick(imported.stressHighMinutes, inputs.ouraStressHighMinutes),
      recovery: pick(imported.recoveryHighMinutes, inputs.ouraRecoveryHighMinutes),
      spo2: pick(imported.spo2Average, inputs.ouraSpO2),
      hrv: pick(imported.hrvMs, merged.hrvMs, inputs.hrvMs),
      restingHeartRate: pick(
        imported.restingHeartRate,
        merged.restingHeartRate,
        inputs.restingHeartRate
      ),
    };
  });
}

// --- reading a metric in plain English ---------------------------------------

/**
 * How many prior days are needed before the app will call a value unusual.
 *
 * Same gate as the readiness baselines. Below this a "worse than usual" badge
 * is a claim about a normal that has not been established yet.
 */
export const MIN_FOR_VERDICT = 5;

export type Verdict = "better" | "worse" | "normal" | "unknown";

export interface MetricSummary {
  latest: number | null;
  latestDate: IsoDate | null;
  /** The middle half of prior readings — this athlete's own normal. */
  usual: { low: number; high: number } | null;
  verdict: Verdict;
  /** How many prior readings the usual range was built from. */
  observations: number;
}

/** Linear-interpolated quantile over a sorted ascending list. */
function quantile(sorted: number[], fraction: number): number {
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/**
 * The latest reading, the athlete's usual range, and whether today is good news.
 *
 * "Better" and "worse" are direction-aware: 200 high-stress minutes is a worse
 * day than 40, while a higher HRV is a better one. Getting this backwards would
 * be worse than showing nothing, so every series states its direction.
 */
export function summariseMetric(
  days: OuraTrendDay[],
  getter: (day: OuraTrendDay) => number | null,
  options: { higherIsBetter: boolean; allowZero?: boolean }
): MetricSummary {
  const readings = days
    .map((day) => ({ value: getter(day), date: day.date }))
    .filter((item): item is { value: number; date: IsoDate } => {
      if (item.value === null || !Number.isFinite(item.value)) return false;
      return options.allowZero ? item.value >= 0 : item.value > 0;
    });

  if (readings.length === 0) {
    return { latest: null, latestDate: null, usual: null, verdict: "unknown", observations: 0 };
  }

  const last = readings[readings.length - 1];
  const priors = readings.slice(0, -1).map((item) => item.value);

  if (priors.length < MIN_FOR_VERDICT) {
    return {
      latest: last.value,
      latestDate: last.date,
      usual: null,
      verdict: "unknown",
      observations: priors.length,
    };
  }

  const sorted = [...priors].sort((a, b) => a - b);
  const usual = { low: quantile(sorted, 0.25), high: quantile(sorted, 0.75) };

  const above = last.value > usual.high;
  const below = last.value < usual.low;
  const verdict: Verdict = above
    ? options.higherIsBetter
      ? "better"
      : "worse"
    : below
      ? options.higherIsBetter
        ? "worse"
        : "better"
      : "normal";

  return { latest: last.value, latestDate: last.date, usual, verdict, observations: priors.length };
}

// --- chart geometry ----------------------------------------------------------

/**
 * The chart box.
 *
 * Wider left margin than v60 had, because the y-axis now carries labels — a
 * scale with no numbers on it tells a reader nothing about whether 62 is high.
 * The bottom band holds the date labels; sizing the box to exclude them is
 * what gives a card its own little scrollbar.
 */
export const CHART = { width: 400, height: 200, left: 40, right: 14, top: 22, bottom: 30 } as const;

export interface ChartPoint {
  value: number;
  date: IsoDate;
  x: number;
  y: number;
}

export interface ChartTick {
  value: number;
  y: number;
}

export interface ChartGeometry {
  points: ChartPoint[];
  path: string;
  axisY: number;
  /** Two or three labelled gridlines — an unlabelled axis says nothing. */
  ticks: ChartTick[];
  /** The athlete's usual range as a shaded band, when one is established. */
  band: { top: number; bottom: number } | null;
  plotLeft: number;
  plotRight: number;
}

/**
 * Two or three round numbers spanning the axis.
 *
 * Rounding to a 1 / 2 / 5 step is what makes a tick readable — "0, 50, 100"
 * is a scale a reader can hold in their head; "3.7, 51.4, 99.1" is not.
 */
function ticksForStep(lo: number, hi: number, step: number): number[] {
  const ticks: number[] = [];
  for (let value = Math.ceil(lo / step) * step; value <= hi + step * 1e-6; value += step) {
    // Floating-point accumulation turns 0.30000000000000004 into a tick label.
    ticks.push(Number(value.toFixed(6)));
  }
  return ticks;
}

function niceTicks(lo: number, hi: number): number[] {
  const span = hi - lo;
  if (!Number.isFinite(span) || span <= 0) return [lo];

  // Walk candidate steps from fine to coarse and take the first that lands in
  // a readable band. Aiming at a fixed tick count instead tends to pick a step
  // one size too coarse and leave a chart with two labels on it.
  const magnitude = 10 ** Math.floor(Math.log10(span));
  const candidates = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10].map((factor) => factor * magnitude);

  let fallback: number[] = [lo, hi];
  for (const step of candidates) {
    const ticks = ticksForStep(lo, hi, step);
    if (ticks.length > 6) continue;
    if (ticks.length >= 3) return ticks;
    fallback = ticks.length >= 2 ? ticks : fallback;
  }
  return fallback;
}

/**
 * Where each point lands inside the chart box.
 *
 * A zero is dropped by default: a resting heart rate or a sleep score of zero
 * is a missing reading, not a measurement. High-stress minutes are the
 * exception — zero of them is a real and rather good day — so that series
 * passes `allowZero`.
 *
 * Returns null when there is nothing to draw, which is the caller's cue to
 * render the empty state rather than an axis with no line on it.
 */
export function chartGeometry(
  days: OuraTrendDay[],
  getter: (day: OuraTrendDay) => number | null,
  options: {
    allowZero?: boolean;
    usual?: { low: number; high: number } | null;
    /** Hard ceiling for the scale — a score out of 100 never reaches 102. */
    max?: number;
  } = {}
): ChartGeometry | null {
  const raw = days
    .map((day) => ({ value: getter(day), date: day.date }))
    .filter((item): item is { value: number; date: IsoDate } => {
      if (item.value === null || !Number.isFinite(item.value)) return false;
      return options.allowZero ? item.value >= 0 : item.value > 0;
    });

  if (raw.length === 0) return null;

  const values = raw.map((item) => item.value);
  const usual = options.usual ?? null;
  // The usual-range band has to fit inside the axis, or it would be clipped
  // into a lie about where the athlete's normal sits.
  const min = Math.min(...values, ...(usual ? [usual.low] : []));
  const max = Math.max(...values, ...(usual ? [usual.high] : []));
  // Padding is a fraction of the *range*, never of the absolute value.
  //
  // Scaling it to the value squashed blood oxygen flat: readings spanning
  // 96.2–97.4 got 4.85 of padding because they sit near 97, so the line
  // occupied a third of the box and every day looked identical. A flat series
  // has no range to scale, so it falls back to a small fixed pad.
  const range = max - min;
  const pad = range > 0 ? range * 0.25 : Math.max(Math.abs(max) * 0.05, 1);
  // Every series here is non-negative — scores, minutes, HRV, SpO2, heart
  // rate — so the axis never needs to go below zero to hold the padding.
  const lo = Math.max(0, min - pad);
  // Padding must not push the axis past what the metric can physically read.
  // An oxygen-saturation chart topping out at 102% is a scale that lies.
  const ceiling = options.max;
  const hi = ceiling === undefined ? max + pad : Math.min(ceiling, max + pad);
  const span = Math.max(hi - lo, 1);

  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const lastIndex = Math.max(raw.length - 1, 1);
  const axisY = CHART.height - CHART.bottom;
  const yFor = (value: number) => CHART.top + (1 - (value - lo) / span) * plotHeight;

  const points: ChartPoint[] = raw.map((item, index) => ({
    value: item.value,
    date: item.date,
    x: CHART.left + (index / lastIndex) * plotWidth,
    y: yFor(item.value),
  }));

  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");

  return {
    points,
    path,
    axisY,
    ticks: niceTicks(lo, hi)
      .filter((value) => value >= lo && value <= hi)
      .map((value) => ({ value, y: yFor(value) })),
    band: usual ? { top: yFor(usual.high), bottom: yFor(usual.low) } : null,
    plotLeft: CHART.left,
    plotRight: CHART.width - CHART.right,
  };
}
