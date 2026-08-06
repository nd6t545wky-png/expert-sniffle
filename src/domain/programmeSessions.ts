/**
 * Typed boundary over the verbatim programme extraction.
 *
 * `programmeContent.ts` is a byte-faithful copy of the prototype's session
 * generation and carries `@ts-nocheck`. Everything outside the domain layer
 * should import from here instead, so the untyped surface stays contained to
 * exactly one file.
 */

import {
  ANNUAL_START,
  LEGACY_PHASE_TABLE,
  ProgrammeContext,
  addDays,
  applyReadinessToSession,
  getWeekPlan,
  isoDate,
  legacyPhaseForWeek,
  nonCompetitionSaturdaySession,
  recoveryOnlySession,
  setProgrammeContext,
  standardSession,
  summerSession,
  todaySelection,
  transitionWednesdaySession,
  isSummerCompetitionPhase,
  isTransitionPhase,
} from "./programmeContent";
import { IsoDate } from "./state";
import { PlanLevel } from "./readiness";

export { setProgrammeContext, ANNUAL_START };
export type { ProgrammeContext };

export interface SessionTask {
  id: string;
  stage: number;
  stageTitle: string;
  stageDescription: string;
  name: string;
  prescription: string;
  cue: string;
  setup?: string;
  execution?: string;
  rest?: string;
  stop?: string;
  [key: string]: unknown;
}

export interface Session {
  title: string;
  focus: string;
  duration: string;
  stress: string;
  description: string;
  tasks: SessionTask[];
  [key: string]: unknown;
}

export interface WeekPlan {
  week: number;
  /** Week start/end are Date objects, not ISO strings — the prototype's
   *  helpers operate on Dates and `dateForWeekDay` converts at the boundary. */
  start: Date;
  end: Date;
  phase: { id: string; name: string; weeks: number[]; color: string; summary: string };
  focus: string;
  mondayLift: string;
  throwing: string;
  recovery: string;
  competition: string;
  [key: string]: unknown;
}

/** Readiness adjustment applied to a session's prescriptions. */
export interface PlanAdjustment {
  planLevel: PlanLevel;
  workloadFactor: number;
  [key: string]: unknown;
}

/** The programme's own phase table, as the prototype defines it. */
export const PROGRAMME_PHASE_TABLE = LEGACY_PHASE_TABLE as {
  id: string;
  name: string;
  weeks: [number, number];
  color: string;
  summary: string;
}[];

export function phaseForProgrammeWeek(week: number): WeekPlan["phase"] | undefined {
  return legacyPhaseForWeek(week) as WeekPlan["phase"] | undefined;
}

/** Week metadata: dates, phase, and the week's headline prescriptions. */
export function weekPlan(week: number, pbs?: unknown): WeekPlan {
  return getWeekPlan(week, (pbs ?? null) as never) as unknown as WeekPlan;
}

/** Which week/day the programme considers "today". */
export function currentSelection(): { selectedWeek: number; selectedDay: number; openDate: IsoDate } {
  return todaySelection() as { selectedWeek: number; selectedDay: number; openDate: IsoDate };
}

export function dateForWeekDay(week: WeekPlan, day: number): IsoDate {
  return isoDate(addDays(week.start, day)) as IsoDate;
}

/**
 * Build the session for a given week and day.
 *
 * Mirrors the prototype's dispatch exactly: a red readiness reading yields
 * recovery-only work; summer competition weeks, transition Wednesdays and
 * non-competition Saturdays each have their own shape; everything else is the
 * standard session. The readiness adjustment is applied last, as before.
 */
export function buildSession(
  week: WeekPlan,
  day: number,
  options: { risk?: string; adjustment?: PlanAdjustment | null } = {}
): Session {
  if (options.risk === "red") return recoveryOnlySession(week, day) as Session;

  let session: unknown;
  if (isSummerCompetitionPhase(week.phase.id)) {
    session = summerSession(week, day);
  } else if (isTransitionPhase(week.phase.id) && day === 2) {
    session = transitionWednesdaySession(week);
  } else if (
    ["transition", "transition_summer", "preseason", "summer_break"].includes(week.phase.id) &&
    day === 5
  ) {
    session = nonCompetitionSaturdaySession(week);
  } else {
    session = standardSession(week, day);
  }

  return (options.adjustment ? applyReadinessToSession(session, options.adjustment) : session) as Session;
}
