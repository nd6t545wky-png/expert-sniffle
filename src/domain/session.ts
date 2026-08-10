/**
 * Session gating, workload and safety rules.
 *
 * Covers the workflows the prototype already enforced (pre-session readiness,
 * plan unlocking, task completion, post-session reporting) plus the explicit
 * correctness requirements: every session is identified by date, submissions
 * cannot be duplicated, pain overrides are explicit, and high-intent throwing
 * stays on its permitted days.
 */

import { IsoDate, isIsoDate } from "./state";
import { PlanLevel, ReadinessResult, RiskLevel, WORKLOAD_FACTOR } from "./readiness";

/** Monday-first, matching the prototype's DAY_NAMES ordering. */
export const DAY_NAMES = Object.freeze([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const);

export type DayName = (typeof DAY_NAMES)[number];

/**
 * High-intent throwing is restricted to Wednesday and Saturday, so there is
 * never back-to-back high-intent work. This is a programme rule, not a
 * preference — it is enforced here rather than left to the UI.
 */
export const HIGH_INTENT_DAYS: readonly DayName[] = Object.freeze(["Wednesday", "Saturday"]);

export function isHighIntentDay(day: DayName): boolean {
  return HIGH_INTENT_DAYS.includes(day);
}

/** Day name for an ISO date, Monday-first. */
export function dayNameForDate(date: IsoDate): DayName | null {
  if (!isIsoDate(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  // getUTCDay(): 0 = Sunday. Shift so Monday is 0.
  return DAY_NAMES[(parsed.getUTCDay() + 6) % 7];
}

// --- Pre-session readiness submission ---------------------------------------

export interface ReadinessSubmission {
  date: IsoDate;
  score: number;
  risk: RiskLevel;
  planLevel: PlanLevel;
  workloadFactor: number;
  submittedAt: string;
  /** Present when the athlete manually raised the plan level. */
  manualOverride?: ManualOverride;
}

export interface ManualOverride {
  from: PlanLevel;
  to: PlanLevel;
  reason: string;
  at: string;
}

export type SubmitOutcome =
  | { ok: true; submission: ReadinessSubmission }
  | { ok: false; reason: "duplicate" | "invalid-date"; message: string };

/**
 * Record a readiness submission for a date.
 *
 * Refuses a second submission for the same date. The prototype allowed a
 * resubmit to silently replace the first, which loses the original reading
 * and can quietly reopen a session that was correctly held. Re-submitting is
 * possible, but only as an explicit `force`, and the caller is expected to
 * retain the prior record.
 */
export function submitReadiness(
  existing: Record<IsoDate, unknown>,
  date: IsoDate,
  result: ReadinessResult,
  now: Date = new Date(),
  options: { force?: boolean } = {}
): SubmitOutcome {
  if (!isIsoDate(date)) {
    return { ok: false, reason: "invalid-date", message: `"${date}" is not a valid YYYY-MM-DD date.` };
  }
  if (existing[date] !== undefined && !options.force) {
    return {
      ok: false,
      reason: "duplicate",
      message: `Readiness has already been submitted for ${date}.`,
    };
  }
  return {
    ok: true,
    submission: {
      date,
      score: result.score,
      risk: result.risk,
      planLevel: result.planLevel,
      workloadFactor: result.workloadFactor,
      submittedAt: now.toISOString(),
    },
  };
}

// --- Plan unlocking ----------------------------------------------------------

export type PlanState =
  | { status: "locked"; message: string }
  | { status: "held"; message: string; workloadFactor: 0 }
  | { status: "unlocked"; planLevel: PlanLevel; workloadFactor: number };

/**
 * The day's plan is gated behind a readiness submission for that same date.
 * A red-risk reading does not unlock the planned session at all — it is
 * replaced by recovery work pending qualified review.
 */
export function planStateForDate(
  submissions: Record<IsoDate, ReadinessSubmission | undefined>,
  date: IsoDate
): PlanState {
  const submission = submissions[date];
  if (!submission) {
    return { status: "locked", message: "Complete the pre-session readiness check to unlock this session." };
  }
  if (submission.planLevel === "hold" || submission.risk === "red") {
    return {
      status: "held",
      workloadFactor: 0,
      message: "Health hold — the planned session is replaced with recovery and qualified review.",
    };
  }
  const effective = submission.manualOverride?.to ?? submission.planLevel;
  return { status: "unlocked", planLevel: effective, workloadFactor: WORKLOAD_FACTOR[effective] };
}

export function isPlanUnlocked(
  submissions: Record<IsoDate, ReadinessSubmission | undefined>,
  date: IsoDate
): boolean {
  return planStateForDate(submissions, date).status === "unlocked";
}

// --- Manual override ---------------------------------------------------------

export type OverrideOutcome =
  | { ok: true; override: ManualOverride }
  | { ok: false; reason: "hold" | "not-submitted" | "no-reason"; message: string };

/**
 * Raise a reduced/recovery plan back toward full.
 *
 * A `hold` can never be overridden in-app: it is raised by new or worsening
 * warning signs, illness, or shoulder/elbow symptoms at 5+, all of which
 * require qualified review. A reason is mandatory so the decision is on the
 * record rather than being a silent tap.
 */
export function overridePlanLevel(
  submission: ReadinessSubmission | undefined,
  to: PlanLevel,
  reason: string,
  now: Date = new Date()
): OverrideOutcome {
  if (!submission) {
    return { ok: false, reason: "not-submitted", message: "Submit the readiness check before overriding the plan." };
  }
  if (submission.planLevel === "hold" || submission.risk === "red") {
    return {
      ok: false,
      reason: "hold",
      message: "A health hold requires qualified review and cannot be overridden in the app.",
    };
  }
  if (!reason.trim()) {
    return { ok: false, reason: "no-reason", message: "Give a reason for overriding the recommended plan level." };
  }
  return { ok: true, override: { from: submission.planLevel, to, reason: reason.trim(), at: now.toISOString() } };
}

// --- High-intent throwing ----------------------------------------------------

export type ThrowIntent = "recovery" | "low" | "moderate" | "high";

export interface ThrowingSessionInput {
  date: IsoDate;
  intent: ThrowIntent;
  throws: number;
}

export type ThrowingCheck =
  | { allowed: true }
  | { allowed: false; reason: "day-not-permitted" | "plan-held" | "plan-restricts-intent"; message: string };

/**
 * High-intent throwing is permitted only on Wednesday and Saturday, and only
 * when the day's plan is actually unlocked at full level. A reduced or
 * recovery plan caps intent below high regardless of the weekday.
 */
export function checkHighIntentAllowed(
  date: IsoDate,
  intent: ThrowIntent,
  plan: PlanState
): ThrowingCheck {
  if (intent !== "high") return { allowed: true };

  const day = dayNameForDate(date);
  if (!day || !isHighIntentDay(day)) {
    return {
      allowed: false,
      reason: "day-not-permitted",
      message: `High-intent throwing is limited to ${HIGH_INTENT_DAYS.join(" and ")}${day ? `; ${date} is a ${day}` : ""}.`,
    };
  }
  if (plan.status === "held") {
    return { allowed: false, reason: "plan-held", message: "A health hold is in place; no high-intent throwing." };
  }
  if (plan.status === "locked") {
    return { allowed: false, reason: "plan-held", message: "Complete the readiness check before throwing at intent." };
  }
  if (plan.planLevel !== "full") {
    return {
      allowed: false,
      reason: "plan-restricts-intent",
      message: `Today's plan is ${plan.planLevel}; high-intent throwing is not permitted.`,
    };
  }
  return { allowed: true };
}

// --- Workload ----------------------------------------------------------------

/** Relative arm cost per throw by intent. */
export const INTENT_WEIGHT: Readonly<Record<ThrowIntent, number>> = Object.freeze({
  recovery: 0.25,
  low: 0.5,
  moderate: 0.75,
  high: 1,
});

/** Weighted throwing load for one session. */
export function throwLoad(session: Pick<ThrowingSessionInput, "intent" | "throws">): number {
  const throws = Number(session.throws);
  if (!Number.isFinite(throws) || throws <= 0) return 0;
  return Math.round(throws * INTENT_WEIGHT[session.intent] * 100) / 100;
}

/** Total weighted load across sessions. */
export function totalThrowLoad(sessions: readonly Pick<ThrowingSessionInput, "intent" | "throws">[]): number {
  return Math.round(sessions.reduce((total, session) => total + throwLoad(session), 0) * 100) / 100;
}

/**
 * Prescribed session volume after the readiness workload factor is applied.
 * Rounded to whole units — you cannot throw two thirds of a ball.
 */
export function adjustedSessionLoad(baseLoad: number, workloadFactor: number): number {
  const base = Number(baseLoad);
  if (!Number.isFinite(base) || base <= 0) return 0;
  return Math.round(base * workloadFactor);
}

/**
 * Acute:chronic workload ratio — 7-day load over the average week of the
 * preceding 28 days. Returns null when there is not enough history to make
 * the number meaningful, rather than a misleading value.
 */
export function acuteChronicRatio(acute7Day: number, chronic28Day: number): number | null {
  if (!Number.isFinite(acute7Day) || !Number.isFinite(chronic28Day) || chronic28Day <= 0) return null;
  const chronicWeekly = chronic28Day / 4;
  if (chronicWeekly <= 0) return null;
  return Math.round((acute7Day / chronicWeekly) * 100) / 100;
}

// --- Task completion ---------------------------------------------------------

export type TaskOutcome =
  | { ok: true; completed: string[] }
  | { ok: false; reason: "locked" | "already-complete"; message: string };

/**
 * Mark a task complete. Tasks stay gated behind the readiness check, and a
 * task cannot be completed twice.
 */
export function completeTask(
  completedByDate: Record<IsoDate, string[] | undefined>,
  plan: PlanState,
  date: IsoDate,
  taskId: string
): TaskOutcome {
  if (plan.status === "locked") {
    return { ok: false, reason: "locked", message: "Complete the readiness check before logging tasks." };
  }
  const completed = completedByDate[date] ?? [];
  if (completed.includes(taskId)) {
    return { ok: false, reason: "already-complete", message: `"${taskId}" is already logged for ${date}.` };
  }
  return { ok: true, completed: [...completed, taskId] };
}

/** Un-complete a task. The prototype's checkbox toggles both ways. */
export function uncompleteTask(
  completedByDate: Record<IsoDate, string[] | undefined>,
  date: IsoDate,
  taskId: string
): string[] {
  return (completedByDate[date] ?? []).filter((id) => id !== taskId);
}

// --- Skipping ----------------------------------------------------------------

export interface SkippedTask {
  reason: string;
  notes?: string;
  skippedAt: string;
}

export type SkipRecords = Record<IsoDate, Record<string, SkippedTask> | undefined>;

export type SkipOutcome =
  | { ok: true; skipped: Record<string, SkippedTask> }
  | { ok: false; reason: "locked" | "health-hold" | "no-reason" | "already-complete"; message: string };

/**
 * The one task category that cannot be skipped. A health hold's actions exist
 * *because* the readiness check flagged something; letting them be dismissed
 * would make the hold advisory, which is exactly what it must not be.
 */
export const UNSKIPPABLE_STAGE = "Health Hold";

/**
 * Record a skip. A skip resolves a task for check-out without recording it as
 * completed, so it always carries a reason — an unexplained gap in the log is
 * indistinguishable from work that was never assigned.
 */
export function skipTask(
  skippedByDate: SkipRecords,
  completedByDate: Record<IsoDate, string[] | undefined>,
  plan: PlanState,
  date: IsoDate,
  task: { id: string; stageTitle?: string },
  input: { reason: string; notes?: string },
  now = new Date()
): SkipOutcome {
  if (plan.status === "locked") {
    return { ok: false, reason: "locked", message: "Complete the readiness check before changing tasks." };
  }
  if (task.stageTitle === UNSKIPPABLE_STAGE) {
    return {
      ok: false,
      reason: "health-hold",
      message:
        "Health-hold actions cannot be skipped. Follow the review guidance before resuming training.",
    };
  }
  if ((completedByDate[date] ?? []).includes(task.id)) {
    return { ok: false, reason: "already-complete", message: "That task is already logged as completed." };
  }
  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false, reason: "no-reason", message: "Choose a reason before skipping this task." };
  }
  const notes = (input.notes ?? "").trim();
  return {
    ok: true,
    skipped: {
      ...(skippedByDate[date] ?? {}),
      [task.id]: { reason, ...(notes ? { notes } : {}), skippedAt: now.toISOString() },
    },
  };
}

/** Return a skipped task to the plan. */
export function undoSkipTask(
  skippedByDate: SkipRecords,
  date: IsoDate,
  taskId: string
): Record<string, SkippedTask> {
  const current = { ...(skippedByDate[date] ?? {}) };
  delete current[taskId];
  return current;
}

/**
 * Session progress. Skipped work is resolved but never counted as completed —
 * the two are reported separately so a session finished by skipping half of it
 * cannot read as a session that was done.
 */
export function sessionProgress(
  tasks: { id: string }[],
  completed: string[],
  skipped: Record<string, SkippedTask>
): { total: number; completed: number; skipped: number; resolved: number; percent: number } {
  const total = tasks.length;
  const completedCount = tasks.filter((task) => completed.includes(task.id)).length;
  const skippedCount = tasks.filter((task) => !completed.includes(task.id) && skipped[task.id]).length;
  const resolved = completedCount + skippedCount;
  return {
    total,
    completed: completedCount,
    skipped: skippedCount,
    resolved,
    percent: total ? Math.round((resolved / total) * 100) : 0,
  };
}

// --- Post-session report -----------------------------------------------------

export interface SessionReport {
  date: IsoDate;
  perceivedExertion: number;
  armFeel: number;
  gamePitches?: number;
  notes?: string;
  submittedAt: string;
}

export type ReportOutcome =
  | { ok: true; report: SessionReport }
  | { ok: false; reason: "duplicate" | "invalid-date" | "not-unlocked"; message: string };

/**
 * Record a post-session report. One per date — a duplicate would double-count
 * the day's workload in every downstream calculation.
 */
export function submitSessionReport(
  existing: Record<IsoDate, unknown>,
  plan: PlanState,
  input: Omit<SessionReport, "submittedAt">,
  now: Date = new Date(),
  options: { force?: boolean } = {}
): ReportOutcome {
  if (!isIsoDate(input.date)) {
    return { ok: false, reason: "invalid-date", message: `"${input.date}" is not a valid YYYY-MM-DD date.` };
  }
  if (plan.status === "locked") {
    return { ok: false, reason: "not-unlocked", message: "Submit the readiness check before reporting the session." };
  }
  if (existing[input.date] !== undefined && !options.force) {
    return { ok: false, reason: "duplicate", message: `A session report already exists for ${input.date}.` };
  }
  return { ok: true, report: { ...input, submittedAt: now.toISOString() } };
}
