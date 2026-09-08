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
  /**
   * How many fixtures the athlete has entered in this session's week.
   *
   * Stamped by `buildSession` and read back by the overlay, so it travels with
   * the session the way its week does. A fourth argument to
   * `applyBaselineProgramming` would have been forgotten by most of its eighty
   * call sites, and a policy that silently does nothing when an argument is
   * forgotten is a policy that will eventually be forgotten — the same
   * reasoning that made `weekFromTasks` read the week off the task ids.
   *
   * Absent means "nobody has said", which is the safe reading: the programme's
   * own phase table is used unchanged.
   */
  gamesThisWeek?: number;
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

/**
 * Which week/day/date the programme considers "today".
 *
 * This is the ONLY source of "today" in the app. It resolves in the
 * programme's timezone (Australia/Brisbane), which is deliberate: the athlete
 * trains there, and the session shown must match the date records are saved
 * under. Using the device clock instead would put a readiness entry on one day
 * and the session it unlocked on another whenever the device is not on
 * Brisbane time.
 */
export function currentSelection(): { selectedWeek: number; selectedDay: number; openDate: IsoDate } {
  return todaySelection() as { selectedWeek: number; selectedDay: number; openDate: IsoDate };
}

export function dateForWeekDay(week: WeekPlan, day: number): IsoDate {
  return isoDate(addDays(week.start, day)) as IsoDate;
}

/** True when this session is built around an actual appearance. */
export function sessionHasGame(session: Pick<Session, "tasks">): boolean {
  return session.tasks.some(
    (task) => task.stageTitle === "Compete" || /game appearance/i.test(String(task.name))
  );
}

/**
 * The programme's game day, moved onto another weekday.
 *
 * The programme writes exactly one game-day session — Saturday's "prepare,
 * compete, recover" — and nothing in its content is Saturday-specific. A
 * finals series that runs Friday and Saturday needs it twice, so it is rebuilt
 * for the day in question rather than invented a second time.
 *
 * The ids are re-keyed, and that is the whole reason this is a function rather
 * than a call. Every task id carries its day (`w9-d5-catch`), and handing
 * Friday a session full of `-d5-` ids would file Friday's ticks, set logs and
 * skips against Saturday's tasks — two days sharing one record, in a week with
 * a game on both.
 */
function gameDayFor(week: WeekPlan, day: number): unknown {
  const saturday = standardSession(week, 5) as Session;
  const rekey = (id: string) => id.replace(/(^|-)d5-/, `$1d${day}-`);
  return {
    ...saturday,
    title: `${DAY_NAMES[day] ?? "Game"} · Game Day`,
    description: `${saturday.description} This day is a game because a fixture was entered for it; the programme had planned it as something else.`,
    tasks: saturday.tasks.map((task) => ({ ...task, id: rekey(String(task.id)) })),
  };
}

const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/**
 * Build the session for a given week and day.
 *
 * Mirrors the prototype's dispatch exactly: a red readiness reading yields
 * recovery-only work; summer competition weeks, transition Wednesdays and
 * non-competition Saturdays each have their own shape; everything else is the
 * standard session. The readiness adjustment is applied last, as before.
 *
 * `options.game` is the one addition, and it is the fixture list talking. The
 * programme's calendar is fixed at fifty-two weeks and guesses, by phase,
 * which days hold a game — `nonCompetitionSaturdaySession` says so in its own
 * description: "No league game is assumed in this calendar block." A fixture
 * the athlete has entered is not an assumption, so where the two disagree the
 * fixture wins and the day is built as a game day.
 *
 * It only ever adds a game. A day the programme already planned as one is left
 * exactly as it was, and a day with no fixture is untouched — nothing here
 * takes a game *away*, because the absence of an entry means nobody has told
 * the app about that week yet, not that the week is empty.
 */
export function buildSession(
  week: WeekPlan,
  day: number,
  options: {
    risk?: string;
    adjustment?: PlanAdjustment | null;
    game?: boolean;
    /** Fixtures in this whole week, for the week-level intensity policy. */
    weekGames?: number;
  } = {}
): Session {
  const stamp = (built: Session): Session =>
    options.weekGames === undefined ? built : { ...built, gamesThisWeek: options.weekGames };

  if (options.risk === "red") return stamp(recoveryOnlySession(week, day) as Session);

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

  if (options.game && !sessionHasGame(session as Session)) {
    session = gameDayFor(week, day);
  }

  return stamp(
    (options.adjustment ? applyReadinessToSession(session, options.adjustment) : session) as Session
  );
}
