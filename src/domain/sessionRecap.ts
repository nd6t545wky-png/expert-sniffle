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
  label: string;
  value: string;
  /** Small qualifier under the value, e.g. "of 18". */
  detail?: string;
}

export interface SessionRecap {
  date: IsoDate;
  /** The session's own name, e.g. "Bullpen · Command". */
  title: string;
  focus: string;
  /** "100%", "75%", "50%" or "Health hold" — what the day was actually set to. */
  effort: string;
  stats: RecapStat[];
  /** Named work worth calling out, longest-lever first. */
  highlights: string[];
  /** True when there is enough logged for a card to be worth making. */
  hasContent: boolean;
}

export interface RecapInput {
  date: IsoDate;
  session?: { title?: unknown; focus?: unknown; duration?: unknown } | null;
  tasks?: SessionTask[];
  completed?: string[];
  skipped?: Record<string, unknown>;
  report?: { perceivedExertion?: number; armFeel?: number; gamePitches?: number; notes?: string } | null;
  submission?: { planLevel?: PlanLevel; risk?: RiskLevel; score?: number } | null;
  throwing?: { throws?: number; intent?: string } | null;
}

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

export function buildRecap(input: RecapInput): SessionRecap {
  const tasks = input.tasks ?? [];
  const done = new Set(input.completed ?? []);
  const skippedIds = new Set(Object.keys(input.skipped ?? {}));

  const completedCount = tasks.filter((task) => done.has(task.id)).length;
  // A task both completed and skipped counts as completed, matching how the
  // plan screen resolves it.
  const skippedCount = tasks.filter((task) => !done.has(task.id) && skippedIds.has(task.id)).length;

  const stats: RecapStat[] = [];

  // Only once something was actually done. A card headed "0 of 14 done" is
  // not a recap of a session — it is a recap of a day the plan was opened and
  // closed, and it should fall through to the "nothing logged yet" state.
  if (completedCount > 0) {
    stats.push({
      label: "Session",
      value: `${completedCount}`,
      detail: `of ${tasks.length} done`,
    });
  }

  // Skipped work is only mentioned when there was some. A permanent "0 skipped"
  // is noise; a "4 skipped" is the most honest number on the card.
  if (skippedCount > 0) {
    stats.push({ label: "Skipped", value: `${skippedCount}` });
  }

  const throws = count(input.throwing?.throws);
  if (throws !== null) {
    stats.push({ label: "Throws", value: `${throws}`, detail: text(input.throwing?.intent) || undefined });
  }

  const pitches = count(input.report?.gamePitches);
  if (pitches !== null) stats.push({ label: "Game pitches", value: `${pitches}` });

  const rpe = count(input.report?.perceivedExertion);
  if (rpe !== null) stats.push({ label: "RPE", value: `${rpe}`, detail: "of 10" });

  const arm = count(input.report?.armFeel);
  if (arm !== null) stats.push({ label: "Arm feel", value: `${arm}`, detail: "of 10" });

  const readiness = count(input.submission?.score);
  if (readiness !== null) stats.push({ label: "Readiness", value: `${readiness}`, detail: "of 100" });

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
    stats,
    highlights: [...new Set(highlights)].slice(0, 4),
    hasContent: stats.length > 0 || highlights.length > 0,
  };
}
