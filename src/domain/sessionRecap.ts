/**
 * What a session actually was, in the handful of facts worth putting on a card.
 *
 * A Strava-style recap is a claim made in public: it says "this is the work I
 * did". So every number here is read from what was logged, and anything that
 * was not logged is omitted rather than defaulted. A recap that quietly prints
 * "0 throws" for a day the throwing log was never opened is not a summary, it
 * is a false statement about training — and this is the one screen in the app
 * whose output leaves the app.
 *
 * Skipped work is counted and shown. A card that reports 18 of 18 tasks on a
 * day where four were skipped is exactly the kind of flattery that makes a
 * training diary useless a season later.
 */

import { IsoDate } from "./state";
import { SessionTask } from "./programmeSessions";
import { PlanLevel, RiskLevel } from "./readiness";

export interface RecapStat {
  /** Stable key, so a chosen set of stats survives a rename of its label. */
  id: string;
  label: string;
  value: string;
  /** Small qualifier under the value, e.g. "of 18". */
  detail?: string;
}

/**
 * A personal best set today.
 *
 * Only ever set by comparing a logged value against the stored best — the
 * card must never award a PB it cannot point at.
 */
export interface RecapPb {
  label: string;
  value: string;
  previous: string;
}

/** The six the card shows unless the athlete picks otherwise. */
export const DEFAULT_STAT_IDS = [
  "throws",
  "tonnage",
  "duration",
  "topVelocity",
  "load",
  "calories",
] as const;

/** How many stats fit the two-column grid without the card becoming a table. */
export const MAX_STATS = 6;

export interface SessionRecap {
  date: IsoDate;
  /** The session's own name, e.g. "Bullpen · Command". */
  title: string;
  focus: string;
  /** "100%", "75%", "50%" or "Health hold" — what the day was actually set to. */
  effort: string;
  /** Every stat the day can support, for the picker. */
  available: RecapStat[];
  /** The chosen subset, in the order given. */
  stats: RecapStat[];
  /** Named work worth calling out, longest-lever first. */
  highlights: string[];
  /** Set only when today actually beat a stored best. */
  pb: RecapPb | null;
  /** True when there is enough logged for a card to be worth making. */
  hasContent: boolean;
}

export interface RecapInput {
  date: IsoDate;
  session?: { title?: unknown; focus?: unknown; duration?: unknown } | null;
  tasks?: SessionTask[];
  completed?: string[];
  skipped?: Record<string, unknown>;
  report?: {
    perceivedExertion?: number;
    armFeel?: number;
    gamePitches?: number;
    notes?: string;
    bestVelocity?: number;
    velocityType?: string;
  } | null;
  submission?: { planLevel?: PlanLevel; risk?: RiskLevel; score?: number } | null;
  throwing?: { throws?: number; intent?: string } | null;
  /** Calories eaten, from the nutrition log. */
  calories?: number | null;
  /** Kilograms actually lifted, from the set log. */
  tonnageKg?: number | null;
  /** `state.pbs`, for deciding whether today set one. */
  pbs?: unknown;
  /** Stat ids to show, in order. Falls back to the defaults. */
  chosen?: string[] | null;
}

const VELOCITY_PB_LABELS: Record<string, string> = {
  pulldown: "Pulldown velocity",
  gameFastball: "Game fastball velocity",
};

const PLAN_LABEL: Record<string, string> = {
  full: "100% effort",
  reduced: "75% effort",
  recovery: "50% effort",
  hold: "Health hold",
};

/** A positive, finite number, or null — never a silent zero. */
function count(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/**
 * The stages worth naming on a card, in the order a reader cares about.
 *
 * Warm-up and arm care are the bulk of the task list and the least
 * interesting thing about a day; the throwing and the heavy lifts are what
 * the session actually was.
 */
const HEADLINE_STAGES = [/throw/i, /plyo/i, /velocity|power|force/i, /strength|gym|lift/i];

/** Minutes from a duration string like "60 min" or "70–80 minutes". */
export function durationMinutes(duration: unknown): number | null {
  const match = String(duration ?? "").match(/(\d+)(?:\s*[–-]\s*(\d+))?\s*min/i);
  if (!match) return null;
  // A range is reported at its midpoint — the session was one length, and the
  // midpoint is the least wrong single number for it.
  const low = Number(match[1]);
  const high = match[2] ? Number(match[2]) : low;
  return Math.round((low + high) / 2);
}

/** Groups of thousands, so 4,550 kg reads at a glance. */
function grouped(value: number): string {
  return value.toLocaleString("en-AU");
}

/**
 * Whether today beat a stored personal best.
 *
 * Compared against the stored value, and reported with what it beat — a badge
 * that cannot say what it improved on is a badge nobody trusts.
 */
function personalBest(input: RecapInput): RecapPb | null {
  const velocity = count(input.report?.bestVelocity);
  const type = text(input.report?.velocityType);
  if (velocity === null || !VELOCITY_PB_LABELS[type]) return null;

  const pbs = input.pbs as { velocity?: Record<string, { value?: unknown }> } | undefined;
  const previous = Number(pbs?.velocity?.[type]?.value ?? 0);
  if (!(velocity > previous)) return null;

  return {
    label: VELOCITY_PB_LABELS[type],
    value: `${velocity} mph`,
    previous: previous > 0 ? `${previous} mph` : "first recorded",
  };
}

export function buildRecap(input: RecapInput): SessionRecap {
  const tasks = input.tasks ?? [];
  const done = new Set(input.completed ?? []);
  const skippedIds = new Set(Object.keys(input.skipped ?? {}));

  const completedCount = tasks.filter((task) => done.has(task.id)).length;
  // A task both completed and skipped counts as completed, matching how the
  // plan screen resolves it.
  const skippedCount = tasks.filter((task) => !done.has(task.id) && skippedIds.has(task.id)).length;

  const available: RecapStat[] = [];
  const add = (stat: RecapStat) => available.push(stat);

  const throws = count(input.throwing?.throws);
  if (throws !== null) {
    add({ id: "throws", label: "Throws", value: grouped(throws), detail: text(input.throwing?.intent) || undefined });
  }

  // Logged sets only. This used to fall back to the prescription, which meant
  // a day where the load was dropped still reported the load that was planned
  // — a card claiming weight that was never lifted.
  const tonnage = count(input.tonnageKg);
  if (tonnage !== null) add({ id: "tonnage", label: "Volume lifted", value: `${grouped(tonnage)} kg` });

  const minutes = durationMinutes(input.session?.duration);
  if (minutes !== null) add({ id: "duration", label: "Session time", value: `${minutes} min` });

  const velocity = count(input.report?.bestVelocity);
  if (velocity !== null) {
    add({
      id: "topVelocity",
      label: "Top velocity",
      value: `${velocity} mph`,
      detail: VELOCITY_PB_LABELS[text(input.report?.velocityType)] || undefined,
    });
  }

  const rpe = count(input.report?.perceivedExertion);

  // Session load — RPE × minutes, the standard sRPE training-load figure.
  // Only when both halves were logged; half of it is not a load.
  if (rpe !== null && minutes !== null) {
    add({ id: "load", label: "Training load", value: grouped(rpe * minutes), detail: "sRPE" });
  }

  const calories = count(input.calories);
  if (calories !== null) add({ id: "calories", label: "Calories", value: `${grouped(calories)} Cal` });

  if (rpe !== null) add({ id: "rpe", label: "Session RPE", value: `${rpe}`, detail: "of 10" });

  const arm = count(input.report?.armFeel);
  if (arm !== null) add({ id: "armFeel", label: "Arm feel", value: `${arm}`, detail: "of 10" });

  const pitches = count(input.report?.gamePitches);
  if (pitches !== null) add({ id: "gamePitches", label: "Game pitches", value: `${pitches}` });

  const readiness = count(input.submission?.score);
  if (readiness !== null) add({ id: "readiness", label: "Readiness", value: `${readiness}`, detail: "of 100" });

  // Only once something was actually done. A card headed "0 of 14 done" is
  // not a recap of a session — it is a recap of a day the plan was opened and
  // closed, and it should fall through to the "nothing logged yet" state.
  if (completedCount > 0) {
    add({ id: "session", label: "Session", value: `${completedCount}`, detail: `of ${tasks.length} done` });
  }

  // Skipped work is only mentioned when there was some. A permanent "0 skipped"
  // is noise; a "4 skipped" is the most honest number on the card.
  if (skippedCount > 0) add({ id: "skipped", label: "Skipped", value: `${skippedCount}` });

  // The chosen set, filtered to what the day can actually support — a stat
  // picked last week must not print blank on a day it was never logged.
  const wanted = input.chosen?.length ? input.chosen : [...DEFAULT_STAT_IDS];
  const byId = new Map(available.map((stat) => [stat.id, stat]));
  const stats = wanted
    .map((id) => byId.get(id))
    .filter((stat): stat is RecapStat => Boolean(stat))
    .slice(0, MAX_STATS);

  // Completed work only. A card must never advertise a lift that was skipped.
  const highlights = HEADLINE_STAGES.flatMap((pattern) =>
    tasks
      .filter((task) => done.has(task.id) && pattern.test(String(task.stageTitle ?? "")))
      .map((task) => `${task.name} · ${task.prescription}`)
  );

  const planLevel = String(input.submission?.planLevel ?? "");

  return {
    date: input.date,
    title: text(input.session?.title, "Training session").replace(/^[A-Za-z]+ · /, ""),
    focus: text(input.session?.focus) || text(input.session?.duration),
    effort: PLAN_LABEL[planLevel] ?? "",
    available,
    stats,
    highlights: [...new Set(highlights)].slice(0, 4),
    pb: personalBest(input),
    hasContent: available.length > 0 || highlights.length > 0,
  };
}
