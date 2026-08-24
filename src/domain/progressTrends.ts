/**
 * Whether the training is actually working.
 *
 * The app had been collecting the raw material for months — logged sets, an
 * imported pitch log, a bodyweight on every check-in — and showing none of its
 * shape. A single number ("your best back squat is 145 kg") answers a trivia
 * question; the line that got there answers the only question that matters,
 * which is whether the last eight weeks moved anything.
 *
 * Three series, because these are the three the athlete already records:
 *
 *   - Estimated one-rep max, per named lift, from the logged sets.
 *   - Top throwing speed per day, from the pitch log and the check-out figure.
 *   - Bodyweight, from the check-ins.
 *
 * Every point is a measurement. Nothing is interpolated, smoothed or carried
 * forward — the same stance the recovery trends take, and for the same reason:
 * a filled gap reads as a session that happened.
 */

import { buildSession, dateForWeekDay, weekPlan } from "./programmeSessions";
import { applyBaselineProgramming } from "./programmeUpdates";
import { Pitch, readPitches } from "./pitchLog";
import { bestOneRepMax, readDayLog } from "./setLog";
import { IsoDate } from "./state";

export interface TrendPoint {
  date: IsoDate;
  value: number;
}

/**
 * Below two measurements there is no trend, only a reading.
 *
 * A one-point chart is a dot on an axis. It would still be *true*, which is
 * exactly what makes it tempting — but it invites a reader to see a direction
 * that has not been measured yet.
 */
export const MIN_POINTS_FOR_TREND = 2;

// --- Naming the lifts --------------------------------------------------------

const PROGRAMME_WEEKS = 52;
const DAYS_PER_WEEK = 7;

/**
 * Task ids mapped to the lift's name, for the dates that were actually logged.
 *
 * Logged sets are keyed by task id, and a task id carries its week and day —
 * the same back squat is `w3-d0-squat` one week and `w4-d0-squat` the next. So
 * the names have to come from the programme, and the only honest way to get
 * them is to ask it: walk the weeks forward, build the sessions whose dates
 * appear in the log, and read the names off the tasks.
 *
 * Deliberately forward-only. Deriving `(week, day)` back out of a date would
 * be a second implementation of a mapping the app already has exactly one of,
 * and the two would eventually disagree about a Sunday.
 */
export function taskNamesForDates(dates: Iterable<IsoDate>): Record<string, string> {
  const wanted = new Set(dates);
  const names: Record<string, string> = {};
  if (wanted.size === 0) return names;

  for (let week = 1; week <= PROGRAMME_WEEKS && wanted.size > 0; week += 1) {
    const plan = weekPlan(week);
    for (let day = 0; day < DAYS_PER_WEEK; day += 1) {
      const date = dateForWeekDay(plan, day);
      if (!wanted.has(date)) continue;
      wanted.delete(date);
      // Through the overlay, not the raw session. The back squat, the depth
      // jump, the RDL and the calf raise are added by
      // `applyBaselineProgramming` and exist in no raw session — so naming
      // from `buildSession` alone left every one of them permanently
      // unidentifiable, and a logged back squat could never be matched to the
      // lift it belonged to. It reported "no history" forever, and it was
      // missing from the progress charts for the same reason.
      for (const task of applyBaselineProgramming(buildSession(plan, day), null, day).tasks) {
        names[task.id] = task.name;
      }
    }
  }
  return names;
}

// --- The series --------------------------------------------------------------

export interface LiftSeries {
  /** The lift's name, which is also its identity across weeks. */
  name: string;
  points: TrendPoint[];
}

/**
 * Estimated one-rep max per lift, one point per day it was trained.
 *
 * Only lifts with at least two logged days appear. A lift trained once has a
 * number, not a trend, and the strength card is not the place to show it.
 */
export function liftProgress(
  logs: Record<string, unknown> | undefined,
  names: Record<string, string>
): LiftSeries[] {
  const byLift = new Map<string, Map<IsoDate, number>>();

  for (const date of Object.keys(logs ?? {})) {
    const day = readDayLog(logs, date);
    for (const [taskId, sets] of Object.entries(day)) {
      const name = names[taskId];
      if (!name) continue;
      const kg = bestOneRepMax(sets);
      if (kg === null) continue;
      const series = byLift.get(name) ?? new Map<IsoDate, number>();
      // Two entries for one lift on one day keep the heavier — a session split
      // across two task rows is still one session's best.
      series.set(date, Math.max(series.get(date) ?? 0, kg));
      byLift.set(name, series);
    }
  }

  return [...byLift.entries()]
    .map(([name, days]) => ({
      name,
      points: [...days.entries()]
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .filter((series) => series.points.length >= MIN_POINTS_FOR_TREND)
    // Busiest lift first: the one with the most sessions behind it is the one
    // whose line has something to say.
    .sort((a, b) => b.points.length - a.points.length || a.name.localeCompare(b.name));
}

/**
 * Fastest throw per day.
 *
 * Two sources, and the higher wins: the imported pitch log is a device's
 * reading, and the check-out figure is what a radar gun showed on a day no
 * file was exported. Neither is a guess, so taking the maximum loses nothing —
 * whereas preferring one source outright would blank every day the athlete
 * used the other.
 */
export function velocityHistory(
  pitches: Record<string, unknown> | undefined,
  reports: Record<string, { bestVelocity?: unknown } | undefined> | undefined
): TrendPoint[] {
  const best = new Map<IsoDate, number>();

  const offer = (date: IsoDate, value: unknown) => {
    const mph = Number(value);
    if (!Number.isFinite(mph) || mph <= 0) return;
    best.set(date, Math.max(best.get(date) ?? 0, mph));
  };

  for (const date of Object.keys(pitches ?? {})) {
    for (const pitch of readPitches(pitches, date) as Pitch[]) {
      // A pitch carries the date it was thrown, which is not always the date
      // the file was imported under.
      offer(pitch.date || date, pitch.velocityMph);
    }
  }

  for (const [date, report] of Object.entries(reports ?? {})) {
    offer(date, report?.bestVelocity);
  }

  return [...best.entries()]
    .map(([date, value]) => ({ date, value: Math.round(value * 10) / 10 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Bodyweight from the check-ins that carried one, oldest first. */
export function bodyweightHistory(
  pre: Record<string, unknown> | undefined
): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (const [date, entry] of Object.entries(pre ?? {})) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    // Check-ins nest their answers under `inputs`; older ones did not.
    const inputs =
      typeof record.inputs === "object" && record.inputs !== null
        ? (record.inputs as Record<string, unknown>)
        : record;
    const kg = Number(inputs.bodyweightKg ?? record.bodyweightKg);
    if (Number.isFinite(kg) && kg > 0) points.push({ date, value: kg });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

// --- Reading a progression in plain English ----------------------------------

export type ProgressVerdict = "best" | "up" | "level" | "down";

export interface ProgressSummary {
  latest: TrendPoint;
  /** The high-water mark. Only meaningful where a direction is better. */
  best: TrendPoint;
  first: TrendPoint;
  /** Latest minus first, in the series' own unit. */
  change: number;
  changePct: number;
  verdict: ProgressVerdict;
  /** How many days contributed a measurement. */
  sessions: number;
}

/**
 * Movement in a percentage below which nothing is claimed.
 *
 * An estimated one-rep max is arithmetic on a rep count; bodyweight moves a
 * kilogram with a glass of water. Calling a 0.4% move "up" would be reading
 * noise back to the athlete as progress.
 */
export const STEADY_BAND_PCT = 1;

/**
 * Where a series has got to, against where it started.
 *
 * `higherIsBetter: null` is the bodyweight case — up is not good news and down
 * is not bad news, so the summary reports the direction and declines to call a
 * high-water mark a "best".
 */
export function summariseProgress(
  points: TrendPoint[],
  options: { higherIsBetter?: boolean | null } = {}
): ProgressSummary | null {
  if (points.length === 0) return null;

  const ordered = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const first = ordered[0];
  const latest = ordered[ordered.length - 1];
  const direction = options.higherIsBetter ?? null;

  const best = ordered.reduce((champion, point) => {
    if (direction === false) return point.value < champion.value ? point : champion;
    return point.value > champion.value ? point : champion;
  }, ordered[0]);

  const change = Math.round((latest.value - first.value) * 10) / 10;
  const changePct =
    first.value === 0 ? 0 : Math.round(((latest.value - first.value) / first.value) * 1000) / 10;

  // A repeat of an earlier best is still the best figure on record, so the
  // comparison is on value rather than on identity — otherwise matching a
  // personal best would read as "holding steady".
  const atBest = ordered.length > 1 && latest.value === best.value;

  // The noise band is checked *first*, and that ordering is the whole point of
  // it. A series that has crept from 100 to 100.5 has its highest value on the
  // last day, which is technically a best and would be announced as one — a
  // half-kilogram of Epley arithmetic sold back to the athlete as a personal
  // record. Where the series has genuinely moved, the band never fires and a
  // best is still called a best.
  const steady = Math.abs(changePct) <= STEADY_BAND_PCT;

  const verdict: ProgressVerdict = steady
    ? "level"
    : direction !== null && atBest
      ? "best"
      : changePct > 0
        ? "up"
        : "down";

  return { latest, best, first, change, changePct, verdict, sessions: ordered.length };
}
