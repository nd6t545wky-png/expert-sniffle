/**
 * Connected health data, folded into the readiness check-in.
 *
 * The scorer in `readiness.ts` has always been able to use wearable data: it
 * weights an Oura readiness score at 25% of the final number, and treats high
 * stress minutes, a temperature deviation, Rest Mode, a depressed HRV or an
 * elevated resting heart rate as reasons to reduce or hold. None of that ever
 * fired in the rebuilt UI, because nothing ever fetched the data — so every
 * check-in was scored on subjective answers alone while presenting itself as
 * the full readiness model.
 *
 * This module is the missing half, kept pure so the arithmetic can be tested
 * without a network or a DOM:
 *
 *   - reading the fetched payload defensively (it arrives from the network and
 *     is persisted into `unknown`-typed state, so nothing here trusts a shape),
 *   - turning it into the wearable half of `ReadinessInputs`,
 *   - naming which fields came from a device, so the form can mark them
 *     read-only rather than inviting an edit that will be overwritten,
 *   - and building the rolling same-source baselines the HRV and resting-heart-
 *     rate signals are gated on.
 *
 * Baselines are deliberately *same-source*: an Oura HRV reading and an Apple
 * Health HRV reading are not the same measurement, and comparing today's Oura
 * number against a median built from a different device would manufacture
 * signals out of nothing but a change of wearable.
 */

import { HealthSummary } from "./api";
import {
  Baseline,
  MetricSource,
  ReadinessContext,
  ReadinessInputs,
} from "./readiness";
import { IsoDate } from "./state";

/** How many prior check-ins a rolling baseline looks back over. */
export const BASELINE_WINDOW = 14;

/** A metric with no device behind it — the athlete typed it, or it is absent. */
export type MetricProvenance = MetricSource | "manual";

/** One date's fetched health payload, as persisted into `state.healthPrefill`. */
export interface HealthPrefillRecord {
  merged?: HealthSummary | null;
  sources?: {
    oura?: { connected?: boolean; data?: HealthSummary | null; updatedAt?: string; error?: string };
    appleHealth?: { connected?: boolean; data?: HealthSummary | null; updatedAt?: string };
  };
  fetchedAt?: string;
  /** Set when the fetch itself failed; the form surfaces it and offers a retry. */
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The payload for a date, or an empty record.
 *
 * `state.healthPrefill` is a date-keyed map of `unknown` — it survives a round
 * trip through localStorage and cloud sync, so it can hold anything.
 */
export function readPrefill(
  map: Record<string, unknown> | undefined,
  date: IsoDate
): HealthPrefillRecord {
  const entry = map?.[date];
  return isRecord(entry) ? (entry as HealthPrefillRecord) : {};
}

/** A finite, positive number, or null. Device fields arrive as null routinely. */
function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function median(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Oura's 0-100 sleep score onto the check-in's 1-5 quality scale.
 *
 * The cut points are v60's, unchanged: an 85 is an excellent night, and
 * anything under 40 is a poor one.
 */
export function sleepQualityFromScore(score: unknown): number | null {
  const value = numberOrNull(score);
  if (value === null) return null;
  if (value >= 85) return 5;
  if (value >= 70) return 4;
  if (value >= 55) return 3;
  if (value >= 40) return 2;
  return 1;
}

/**
 * Which device supplied a metric on a given date.
 *
 * Oura wins ties because it is the ring the athlete actually wears to sleep;
 * Apple Health is the fallback aggregator. A metric neither device reported is
 * "manual" — the athlete's own answer, and editable.
 */
export function metricSource(record: HealthPrefillRecord, metric: string): MetricProvenance {
  const oura = record.sources?.oura?.data;
  const apple = record.sources?.appleHealth?.data;
  if (isRecord(oura) && oura[metric] !== null && oura[metric] !== undefined) return "oura";
  if (isRecord(apple) && apple[metric] !== null && apple[metric] !== undefined) return "apple";
  return "manual";
}

/** Human names for the devices that supplied anything, for the prefill banner. */
export function sourceNames(record: HealthPrefillRecord): string[] {
  return [
    record.sources?.oura?.data ? "Oura" : "",
    record.sources?.appleHealth?.data ? "Apple Health" : "",
  ].filter(Boolean) as string[];
}

/** True when any device supplied at least one value for this date. */
export function hasImportedData(record: HealthPrefillRecord): boolean {
  return sourceNames(record).length > 0;
}

/**
 * What fed the readiness number, for the dashboard's provenance tag.
 *
 * The tag is the only place the dashboard says whether a score came off a
 * device or out of a questionnaire, so it must not claim a ring that did not
 * report.
 */
export function wearableLabel(record: HealthPrefillRecord): {
  label: string;
  kind: "sensor" | "manual";
} {
  if (record.sources?.oura?.data) return { label: "Oura + check-in", kind: "sensor" };
  if (record.sources?.appleHealth?.data) return { label: "Apple + check-in", kind: "sensor" };
  return { label: "Health check-in", kind: "manual" };
}

/** Which timestamp a stored record was written at, for last-writer-wins. */
function recordTimestamp(record: unknown): number {
  if (!isRecord(record)) return 0;
  for (const key of ["updatedAt", "fetchedAt"]) {
    const parsed = Date.parse(String(record[key] ?? ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/**
 * Fold a bulk history fetch into the per-date map, newest write winning.
 *
 * A history sweep must never clobber a fresher single-day fetch: the daily
 * route returns a wider `merged` set than the history route does, so blindly
 * overwriting today with its history row would quietly drop fields the
 * check-in is using.
 */
export function mergeHistory(
  existing: Record<string, unknown> | undefined,
  records: Record<string, unknown>,
  fetchedAt: string
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(existing ?? {}) };
  for (const [date, record] of Object.entries(records)) {
    if (!isRecord(record)) continue;
    const incoming = { ...record, fetchedAt };
    const current = merged[date];
    if (!current || recordTimestamp(incoming) >= recordTimestamp(current)) merged[date] = incoming;
  }
  return merged;
}

/**
 * Form fields the device filled in, by the form's own field names.
 *
 * The form marks these read-only. `sleepQuality` is included when a sleep
 * score exists, because the 1-5 value shown is derived from that score rather
 * than chosen — leaving it editable would let a typed answer silently disagree
 * with the number it claims to be derived from.
 */
export function importedFields(record: HealthPrefillRecord): Set<string> {
  const fields = new Set<string>();
  for (const [field, metric] of [
    ["sleepHours", "sleepHours"],
    ["restingHeartRate", "restingHeartRate"],
    ["hrvMs", "hrvMs"],
    ["bodyweight", "bodyweightKg"],
  ] as const) {
    if (metricSource(record, metric) !== "manual") fields.add(field);
  }
  if (sleepQualityFromScore(record.merged?.sleepScore) !== null) fields.add("sleepQuality");
  return fields;
}

/**
 * The wearable half of the check-in inputs.
 *
 * Only keys the devices actually reported are returned, so spreading this over
 * the form defaults never blanks a field the athlete can still answer. Oura's
 * own fields (stress minutes, temperature, Rest Mode) are read from the Oura
 * source rather than the merged summary — they have no Apple equivalent to
 * merge with, and the scorer labels them as Oura's in the reasons it gives.
 */
export function wearableInputs(record: HealthPrefillRecord): Partial<ReadinessInputs> {
  const merged: Record<string, unknown> = isRecord(record.merged) ? record.merged : {};
  const oura: Record<string, unknown> = isRecord(record.sources?.oura?.data)
    ? record.sources!.oura!.data!
    : {};
  const inputs: Partial<ReadinessInputs> = {};

  const sleepHours = numberOrNull(merged.sleepHours);
  if (sleepHours !== null) inputs.sleepHours = sleepHours;

  const sleepQuality = sleepQualityFromScore(merged.sleepScore);
  if (sleepQuality !== null) inputs.sleepQuality = sleepQuality;

  const readiness = numberOrNull(merged.readinessScore);
  if (readiness !== null) inputs.ouraReadinessScore = readiness;

  const hrv = numberOrNull(merged.hrvMs);
  if (hrv !== null) inputs.hrvMs = hrv;

  const restingHeartRate = numberOrNull(merged.restingHeartRate);
  if (restingHeartRate !== null) inputs.restingHeartRate = restingHeartRate;

  const stressMinutes = numberOrNull(oura.stressHighMinutes);
  if (stressMinutes !== null) inputs.ouraStressHighMinutes = stressMinutes;

  // Temperature deviation is the one field where a negative value is real and
  // a zero is meaningful, so it cannot go through `numberOrNull`.
  const temperature = Number(oura.temperatureDeviation);
  if (oura.temperatureDeviation !== null && oura.temperatureDeviation !== undefined && Number.isFinite(temperature)) {
    inputs.ouraTemperatureDeviation = temperature;
  }

  if (oura.restMode !== null && oura.restMode !== undefined) {
    inputs.ouraRestMode = oura.restMode ? "yes" : "no";
  }

  return inputs;
}

/** Bodyweight is not a readiness input, but the check-in carries it. */
export function importedBodyweight(record: HealthPrefillRecord): number | null {
  return numberOrNull(isRecord(record.merged) ? record.merged.bodyweightKg : null);
}

/**
 * A stored check-in, as far as baselines care about it.
 *
 * Submissions persist the inputs they were scored from precisely so these
 * medians can be built; a record without them simply does not contribute.
 */
interface StoredCheckIn {
  inputs?: Partial<ReadinessInputs>;
  hrvSource?: MetricProvenance;
  restingHeartRateSource?: MetricProvenance;
  sleepSource?: MetricProvenance;
}

/** Prior check-ins, most recent first, capped at the baseline window. */
function priorCheckIns(
  pre: Record<string, unknown> | undefined,
  date: IsoDate
): [string, StoredCheckIn][] {
  return Object.entries(pre ?? {})
    .filter(([sampleDate, record]) => sampleDate < date && isRecord(record))
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, BASELINE_WINDOW) as [string, StoredCheckIn][];
}

const SOURCE_KEY = {
  hrvMs: "hrvSource",
  restingHeartRate: "restingHeartRateSource",
  sleepHours: "sleepSource",
} as const;

const NO_BASELINE: Baseline = { value: 0, count: 0 };

/**
 * Rolling median of a device metric, from prior check-ins on the same source.
 *
 * Returns nothing for a manual metric: there is no device history to compare
 * against, and the scorer's HRV and resting-heart-rate signals are meant to
 * detect a change in a device's own readings.
 */
export function personalMetricBaseline(
  pre: Record<string, unknown> | undefined,
  date: IsoDate,
  field: keyof typeof SOURCE_KEY,
  source: MetricProvenance
): Baseline {
  if (source === "manual") return NO_BASELINE;
  const samples = priorCheckIns(pre, date)
    .filter(([, record]) => record[SOURCE_KEY[field]] === source)
    .map(([, record]) => Number(record.inputs?.[field]))
    .filter((value) => Number.isFinite(value) && value > 0);
  const value = median(samples);
  return value === null ? NO_BASELINE : { value, count: samples.length };
}

/**
 * Rolling median of a subjective answer from prior check-ins.
 *
 * Soreness scales start at zero and a zero is a real answer, so they are not
 * filtered out the way a "0 hours of sleep" would be.
 */
export function personalCheckInBaseline(
  pre: Record<string, unknown> | undefined,
  date: IsoDate,
  field: keyof ReadinessInputs
): Baseline {
  const allowZero = ["shoulder", "elbow", "forearm", "lat", "lower"].includes(field);
  const samples = priorCheckIns(pre, date)
    .map(([, record]) => Number(record.inputs?.[field]))
    .filter((value) => Number.isFinite(value) && (allowZero ? value >= 0 : value > 0));
  const value = median(samples);
  return value === null ? NO_BASELINE : { value, count: samples.length };
}

/** Metric provenance for a date, in the shape the scorer records on its result. */
export function metricSources(record: HealthPrefillRecord): {
  hrvSource?: MetricSource;
  restingHeartRateSource?: MetricSource;
  sleepSource?: MetricSource;
} {
  const named = (source: MetricProvenance) => (source === "manual" ? undefined : source);
  return {
    hrvSource: named(metricSource(record, "hrvMs")),
    restingHeartRateSource: named(metricSource(record, "restingHeartRate")),
    sleepSource: named(metricSource(record, "sleepHours")),
  };
}

/**
 * Everything `computeReadiness` needs beyond the answers themselves.
 *
 * Baselines the scorer will ignore (fewer than five observations) are still
 * returned — the gate lives in one place, in the scorer, rather than being
 * duplicated here where the two could drift apart.
 */
export function readinessContextFor(
  pre: Record<string, unknown> | undefined,
  record: HealthPrefillRecord,
  date: IsoDate
): ReadinessContext {
  const sources = metricSources(record);
  return {
    ...sources,
    hrvBaseline: personalMetricBaseline(pre, date, "hrvMs", metricSource(record, "hrvMs")),
    restingHeartRateBaseline: personalMetricBaseline(
      pre,
      date,
      "restingHeartRate",
      metricSource(record, "restingHeartRate")
    ),
    sleepHoursBaseline: personalCheckInBaseline(pre, date, "sleepHours"),
    energyBaseline: personalCheckInBaseline(pre, date, "energy"),
    moodBaseline: personalCheckInBaseline(pre, date, "mood"),
    stressBaseline: personalCheckInBaseline(pre, date, "stress"),
    previousSoreness: previousSoreness(pre, date),
  };
}

/**
 * Shoulder and elbow as reported at the last check-in before this date.
 *
 * The most recent one, not a median: the scorer is looking for a rise, and a
 * median smooths away exactly the day-to-day movement it is meant to see. A
 * gap of a week still counts — an arm that was 0 last Tuesday and is 3 today
 * has climbed, however long the app went unopened in between.
 */
export function previousSoreness(
  pre: Record<string, unknown> | undefined,
  date: IsoDate
): { shoulder?: number; elbow?: number } | undefined {
  for (const [, record] of priorCheckIns(pre, date)) {
    const inputs = record.inputs;
    if (!isRecord(inputs)) continue;
    const shoulder = Number(inputs.shoulder);
    const elbow = Number(inputs.elbow);
    const found: { shoulder?: number; elbow?: number } = {};
    if (Number.isFinite(shoulder)) found.shoulder = shoulder;
    if (Number.isFinite(elbow)) found.elbow = elbow;
    if (found.shoulder !== undefined || found.elbow !== undefined) return found;
  }
  return undefined;
}
