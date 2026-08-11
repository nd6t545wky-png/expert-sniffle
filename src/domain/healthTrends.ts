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

// --- chart geometry ----------------------------------------------------------

/** v60's chart box, kept exactly so the stylesheet's 190px height still fits. */
export const CHART = { width: 640, height: 190, left: 34, right: 18, top: 18, bottom: 32 } as const;

export interface ChartPoint {
  value: number;
  date: IsoDate;
  x: number;
  y: number;
}

export interface ChartGeometry {
  points: ChartPoint[];
  path: string;
  axisY: number;
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
  options: { allowZero?: boolean } = {}
): ChartGeometry | null {
  const raw = days
    .map((day) => ({ value: getter(day), date: day.date }))
    .filter((item): item is { value: number; date: IsoDate } => {
      if (item.value === null || !Number.isFinite(item.value)) return false;
      return options.allowZero ? item.value >= 0 : item.value > 0;
    });

  if (raw.length === 0) return null;

  const values = raw.map((item) => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Padding keeps a flat series off the axis and stops a two-point chart from
  // rendering as a vertical cliff between two near-identical numbers.
  const pad = Math.max((max - min) * 0.2, max * 0.05, 1);
  // Every series here is non-negative — scores, minutes, HRV, SpO2, heart
  // rate — so the axis never needs to go below zero to hold the padding.
  const lo = Math.max(0, min - pad);
  const hi = max + pad;
  const span = Math.max(hi - lo, 1);

  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const lastIndex = Math.max(raw.length - 1, 1);

  const points: ChartPoint[] = raw.map((item, index) => ({
    value: item.value,
    date: item.date,
    x: CHART.left + (index / lastIndex) * plotWidth,
    y: CHART.top + (1 - (item.value - lo) / span) * plotHeight,
  }));

  return {
    points,
    path: points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" "),
    axisY: CHART.height - CHART.bottom,
  };
}
