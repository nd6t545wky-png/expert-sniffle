import { IsoDate } from "./state";

/**
 * The physical qualities, re-measured.
 *
 * Every force-plate number this programme is built on was taken once, in April
 * 2026, and displayed ever since as a static record. The squat block, the depth
 * jumps, the speed squat, the calf dose and the capped plyo intent were all
 * aimed at qualities in that report — and there has been no way to find out
 * whether any of them moved.
 *
 * That is the difference between a programme and a guess with good citations.
 * The constraint profile asks for a retest every two to four weeks; this runs
 * every third week, which is the practical end of that range for an athlete in
 * season, and lands on a Monday when readiness is highest and the session is
 * already a force day.
 *
 * ## What it deliberately does not do
 *
 * It does not grade. The profile is explicit that its numbers are "directional
 * targets, not hard cut-offs", so a reading short of target is reported as a
 * distance, never as a fail. And it does not average: the interesting question
 * for a reactive quality is the best contact the athlete produced, not their
 * mean, so each entry is a single best figure the way the original report was.
 */

export type Direction = "up" | "down";

export interface RetestMetric {
  id: string;
  label: string;
  unit: string;
  /** April 2026, from the VALD report. Null where nothing was ever measured. */
  baseline: number | null;
  /** The profile's first target, then the longer-term one where it names two. */
  target: number | null;
  stretch: number | null;
  /** Which way is better. */
  direction: Direction;
  /** Decimal places to read it back at. */
  places: number;
  /** How to take the measurement, for the athlete standing on the plate. */
  how: string;
}

/**
 * The battery, in the order it should be performed.
 *
 * Jumps first while completely fresh — a squat jump after sprinting is a
 * different test — then the sprint, then the loaded velocities, then the
 * med-ball. Contact-time metrics come before anything that fatigues the calf.
 */
export const RETEST_METRICS: readonly RetestMetric[] = Object.freeze([
  {
    id: "sj",
    label: "Squat jump height",
    unit: "cm",
    baseline: 19.8,
    target: 23,
    stretch: null,
    direction: "up",
    places: 1,
    how: "From a paused half-squat, no dip. Best of three, full recovery between.",
  },
  {
    id: "cmj",
    label: "Countermovement jump height",
    unit: "cm",
    baseline: 32.6,
    target: 35,
    stretch: null,
    direction: "up",
    places: 1,
    how: "Hands on hips, one continuous movement. Best of three.",
  },
  {
    id: "cmjContraction",
    label: "CMJ contraction time",
    unit: "ms",
    baseline: 730,
    target: 650,
    stretch: null,
    direction: "down",
    places: 0,
    how: "From the same jump as above. The time from the start of the dip to take-off.",
  },
  {
    id: "djRsi",
    label: "Drop jump RSI",
    unit: "",
    baseline: 0.96,
    target: 1.2,
    stretch: 1.5,
    direction: "up",
    places: 2,
    how: "From the 15–20 cm box. Step off, do not jump off. Best of three.",
  },
  {
    id: "djContact",
    label: "Drop jump ground contact",
    unit: "s",
    baseline: 0.348,
    target: 0.3,
    stretch: 0.25,
    direction: "down",
    places: 3,
    how: "From the same jumps. This is the number the whole reactive block exists to move.",
  },
  {
    id: "sprint10",
    label: "10 m sprint",
    unit: "s",
    baseline: null,
    target: null,
    stretch: null,
    direction: "down",
    places: 2,
    how: "From a two-point start, timing gates or phone at 10 m. Best of two, 3 min apart.",
  },
  {
    id: "barVel65",
    label: "Bar velocity at 65% (94 kg)",
    unit: "m/s",
    baseline: null,
    target: null,
    stretch: null,
    direction: "up",
    places: 2,
    how: "Mean concentric velocity, best single rep. This is the speed-squat load.",
  },
  {
    id: "barVel80",
    label: "Bar velocity at 80% (116 kg)",
    unit: "m/s",
    baseline: 0.51,
    target: null,
    stretch: null,
    direction: "up",
    places: 2,
    how: "Mean concentric velocity, best single rep. Compare against 0.510 m/s in April.",
  },
  {
    id: "medBall",
    label: "Med-ball scoop distance",
    unit: "m",
    baseline: null,
    target: null,
    stretch: null,
    direction: "up",
    places: 1,
    how: "3 kg ball, dominant side, best of three. Mark the spot and keep the same one every time.",
  },
]);

const BY_ID = new Map(RETEST_METRICS.map((metric) => [metric.id, metric]));

// --- When ---------------------------------------------------------------------

/** Weeks between retests. Three is the practical end of the profile's 2–4. */
export const RETEST_INTERVAL_WEEKS = 3;

/**
 * Whether a programme week carries the battery.
 *
 * Anchored to week 1 so the cadence is predictable rather than drifting with
 * whichever week happens to be a deload — weeks 1, 4, 7, 10 and so on. A
 * predictable date is one an athlete can plan a rested Monday around.
 */
export function isRetestWeek(week: number | null): boolean {
  if (week === null || !Number.isInteger(week) || week < 1) return false;
  return week % RETEST_INTERVAL_WEEKS === 1;
}

/** The next retest week from here, inclusive. */
export function nextRetestWeek(week: number): number {
  for (let candidate = Math.max(1, week); candidate <= week + RETEST_INTERVAL_WEEKS; candidate += 1) {
    if (isRetestWeek(candidate)) return candidate;
  }
  return week;
}

// --- Storage ------------------------------------------------------------------

/** One session on the plate, keyed by metric id. */
export interface RetestEntry {
  date: IsoDate;
  values: Record<string, number>;
  note?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function readRetests(value: unknown): RetestEntry[] {
  if (!Array.isArray(value)) return [];
  const out: RetestEntry[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.date !== "string" || !ISO.test(entry.date)) continue;
    const values: Record<string, number> = {};
    if (typeof entry.values === "object" && entry.values !== null) {
      for (const [id, value] of Object.entries(entry.values as Record<string, unknown>)) {
        const number = Number(value);
        // Zero is not a jump height, a contact time or a bar speed. Treating it
        // as a reading would put a false low point on every chart.
        if (BY_ID.has(id) && Number.isFinite(number) && number > 0) values[id] = number;
      }
    }
    if (Object.keys(values).length === 0) continue;
    out.push({
      date: entry.date as IsoDate,
      values,
      ...(typeof entry.note === "string" && entry.note.trim() ? { note: entry.note.trim() } : {}),
    });
  }
  // Newest first, and one entry per date — a re-entry replaces the day.
  const byDate = new Map(out.map((entry) => [entry.date, entry]));
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

// --- Reading it back ------------------------------------------------------------

export interface MetricReading {
  metric: RetestMetric;
  /** The most recent measured value, or null if never measured since April. */
  latest: number | null;
  latestOn: IsoDate | null;
  /** Change against April, signed so positive always means "better". */
  improvement: number | null;
  /** Distance still to go to the first target, or null once it is met. */
  toTarget: number | null;
  /** True once the first target is met. */
  metTarget: boolean;
  /** True once the longer-term target is met, where one exists. */
  metStretch: boolean;
}

function better(direction: Direction, value: number, than: number): boolean {
  return direction === "up" ? value >= than : value <= than;
}

/** Every metric, with whatever has been measured since. */
export function readings(entries: readonly RetestEntry[]): MetricReading[] {
  return RETEST_METRICS.map((metric) => {
    const found = entries.find((entry) => entry.values[metric.id] !== undefined);
    const latest = found ? found.values[metric.id] : null;
    const start = metric.baseline;

    const improvement =
      latest === null || start === null
        ? null
        : Number(((metric.direction === "up" ? latest - start : start - latest)).toFixed(metric.places + 1));

    const metTarget = latest !== null && metric.target !== null && better(metric.direction, latest, metric.target);
    const metStretch = latest !== null && metric.stretch !== null && better(metric.direction, latest, metric.stretch);
    const toTarget =
      latest === null || metric.target === null || metTarget
        ? null
        : Number(Math.abs(metric.target - latest).toFixed(metric.places));

    return {
      metric,
      latest,
      latestOn: found ? found.date : null,
      improvement,
      toTarget,
      metTarget,
      metStretch,
    };
  });
}

/** One line for the plan: what has been measured and what has not. */
export function retestSummary(entries: readonly RetestEntry[]): {
  measured: number;
  total: number;
  improved: number;
  lastOn: IsoDate | null;
} {
  const all = readings(entries);
  return {
    measured: all.filter((reading) => reading.latest !== null).length,
    total: all.length,
    improved: all.filter((reading) => (reading.improvement ?? 0) > 0).length,
    lastOn: entries[0]?.date ?? null,
  };
}

/** Format a value the way its metric should be read. */
export function formatMetric(metric: RetestMetric, value: number): string {
  return `${value.toFixed(metric.places)}${metric.unit ? ` ${metric.unit}` : ""}`;
}
