import { IsoDate } from "./state";
import { LEGACY_PHASES, LegacyPhase } from "./legacyPhases";

/**
 * Calendar model for the annual plan.
 *
 * The programme is 52 numbered weeks starting Monday 13 July 2026. A calendar
 * is months and days. This maps between them once, so the year view, the
 * month view and the phase legend all read from the same structure rather
 * than each doing its own arithmetic — the same reason the session pages
 * derive their date from a single (week, day) pair.
 *
 * Phases come from LEGACY_PHASES, the eight fixture-anchored cycles the rest
 * of the app already uses. The five-phase table in `programme.ts` describes
 * the written brief; this view has to agree with the session pages, and the
 * session pages use these.
 */

export const ANNUAL_START: IsoDate = "2026-07-13";
export const PROGRAMME_WEEK_COUNT = 52;

const MS_PER_DAY = 86_400_000;
/** Brisbane, matching the single source of "today" used everywhere else. */
const TZ_OFFSET = "+10:00";

export function parseIso(iso: IsoDate): Date {
  return new Date(`${iso}T00:00:00${TZ_OFFSET}`);
}

export function toIso(date: Date): IsoDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date) as IsoDate;
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return toIso(new Date(parseIso(iso).getTime() + days * MS_PER_DAY));
}

/** Programme week containing a date, or null when it falls outside the year. */
export function programmeWeekFor(iso: IsoDate): number | null {
  const days = Math.floor((parseIso(iso).getTime() - parseIso(ANNUAL_START).getTime()) / MS_PER_DAY);
  if (days < 0) return null;
  const week = Math.floor(days / 7) + 1;
  return week <= PROGRAMME_WEEK_COUNT ? week : null;
}

export function phaseForWeek(week: number | null): LegacyPhase | null {
  if (week === null) return null;
  return LEGACY_PHASES.find((phase) => week >= phase.startWeek && week <= phase.endWeek) ?? null;
}

/** First date of a programme week. */
export function weekStart(week: number): IsoDate {
  return addDays(ANNUAL_START, (week - 1) * 7);
}

export interface CalendarDay {
  date: IsoDate;
  dayOfMonth: number;
  /** False for the leading/trailing days that pad a month grid. */
  inMonth: boolean;
  /** Null outside the 52-week programme. */
  week: number | null;
  phase: LegacyPhase | null;
}

export interface CalendarMonth {
  /** First of the month. */
  key: string;
  label: string;
  shortLabel: string;
  year: number;
  /** Six rows of seven, Monday-first — a fixed shape so months do not jump
   *  height as the grid changes, which is what Apple's calendar does too. */
  weeks: CalendarDay[][];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Calendar fields are read from the ISO string, never from a Date's UTC
 * getters. `parseIso` anchors midnight in Brisbane, which is 14:00 the
 * previous day in UTC — so `getUTCDate()` on it returns yesterday. Splitting
 * the string removes the hazard rather than compensating for it.
 */
export function isoParts(iso: IsoDate): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month: month - 1, day };
}

function day(iso: IsoDate, monthIndex: number): CalendarDay {
  const { month, day: dayOfMonth } = isoParts(iso);
  const week = programmeWeekFor(iso);
  return {
    date: iso,
    dayOfMonth,
    inMonth: month === monthIndex,
    week,
    phase: phaseForWeek(week),
  };
}

/** One month grid, padded to whole Monday-first weeks. */
export function buildMonth(year: number, monthIndex: number): CalendarMonth {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  // getUTCDay is Sunday-first; shift so Monday is 0.
  const leading = (first.getUTCDay() + 6) % 7;
  const gridStart = toIso(new Date(first.getTime() - leading * MS_PER_DAY));

  const weeks: CalendarDay[][] = [];
  for (let row = 0; row < 6; row += 1) {
    const cells: CalendarDay[] = [];
    for (let column = 0; column < 7; column += 1) {
      cells.push(day(addDays(gridStart, row * 7 + column), monthIndex));
    }
    weeks.push(cells);
  }

  return {
    key: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
    label: `${MONTH_NAMES[monthIndex]} ${year}`,
    shortLabel: MONTH_NAMES[monthIndex],
    year,
    weeks,
  };
}

/**
 * Every month the programme touches, in order — July 2026 through July 2027.
 * Derived from the actual first and last dates rather than hardcoded, so a
 * change to the start date or the week count carries through.
 */
export function programmeMonths(): CalendarMonth[] {
  const start = isoParts(ANNUAL_START);
  const end = isoParts(addDays(weekStart(PROGRAMME_WEEK_COUNT), 6));

  const months: CalendarMonth[] = [];
  let year = start.year;
  let month = start.month;
  while (year < end.year || (year === end.year && month <= end.month)) {
    months.push(buildMonth(year, month));
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return months;
}

/** The month grid containing a given date. */
export function monthContaining(iso: IsoDate): CalendarMonth {
  const { year, month } = isoParts(iso);
  return buildMonth(year, month);
}

/** Phases in programme order, with their real date spans. */
export function phaseSpans(): { phase: LegacyPhase; start: IsoDate; end: IsoDate; weeks: number }[] {
  return LEGACY_PHASES.map((phase) => ({
    phase,
    start: weekStart(phase.startWeek),
    end: addDays(weekStart(phase.endWeek), 6),
    weeks: phase.endWeek - phase.startWeek + 1,
  }));
}
