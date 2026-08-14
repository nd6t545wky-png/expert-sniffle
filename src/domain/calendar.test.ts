/**
 * The calendar, which is date arithmetic and therefore the place bugs live.
 *
 * Every mistake this app has had with dates has been the same one: reading a
 * Brisbane-anchored date through a UTC accessor. Midnight in Brisbane is 14:00
 * the previous day in UTC, so `getUTCDate()` on it returns yesterday, and the
 * error only shows up for part of the day. These tests pin the boundaries
 * where that would surface — month edges, the start and end of the programme,
 * and the grid padding either side of a month.
 */

import { describe, expect, it } from "vitest";
import {
  ANNUAL_START,
  PROGRAMME_WEEK_COUNT,
  addDays,
  buildMonth,
  isoParts,
  monthContaining,
  phaseForWeek,
  phaseSpans,
  programmeMonths,
  programmeWeekFor,
  toIso,
  weekStart,
} from "./calendar";
import { LEGACY_PHASES } from "./legacyPhases";

describe("programme weeks", () => {
  it("starts on the Monday the programme starts", () => {
    expect(ANNUAL_START).toBe("2026-07-13");
    expect(programmeWeekFor(ANNUAL_START)).toBe(1);
    expect(weekStart(1)).toBe(ANNUAL_START);
  });

  it("keeps a whole week in the same week number", () => {
    for (let offset = 0; offset < 7; offset += 1) {
      expect(programmeWeekFor(addDays(ANNUAL_START, offset))).toBe(1);
    }
    expect(programmeWeekFor(addDays(ANNUAL_START, 7))).toBe(2);
  });

  it("has nothing before the start or after the end", () => {
    expect(programmeWeekFor(addDays(ANNUAL_START, -1))).toBeNull();
    const lastDay = addDays(weekStart(PROGRAMME_WEEK_COUNT), 6);
    expect(programmeWeekFor(lastDay)).toBe(PROGRAMME_WEEK_COUNT);
    expect(programmeWeekFor(addDays(lastDay, 1))).toBeNull();
  });

  it("every week starts on a Monday", () => {
    for (let week = 1; week <= PROGRAMME_WEEK_COUNT; week += 1) {
      // Read the weekday in Brisbane, not from a UTC getter.
      const weekday = new Intl.DateTimeFormat("en-AU", {
        timeZone: "Australia/Brisbane",
        weekday: "long",
      }).format(new Date(`${weekStart(week)}T00:00:00+10:00`));
      expect(weekday).toBe("Monday");
    }
  });
});

describe("addDays and toIso", () => {
  it("crosses a month boundary", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-08-01", -1)).toBe("2026-07-31");
  });

  it("crosses a year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("does not drift over a long run", () => {
    let date = ANNUAL_START;
    for (let i = 0; i < 364; i += 1) date = addDays(date, 1);
    expect(date).toBe(addDays(ANNUAL_START, 364));
  });

  it("reads a Brisbane midnight back as its own date, not the day before", () => {
    // The bug this file exists for: a UTC accessor would answer 2026-07-12.
    expect(toIso(new Date("2026-07-13T00:00:00+10:00"))).toBe("2026-07-13");
  });
});

describe("isoParts", () => {
  it("reads the parts from the string rather than a Date", () => {
    expect(isoParts("2026-07-13")).toEqual({ year: 2026, month: 6, day: 13 });
  });

  it("is zero-based on month, matching Date's convention", () => {
    expect(isoParts("2027-01-01").month).toBe(0);
    expect(isoParts("2026-12-31").month).toBe(11);
  });
});

describe("buildMonth", () => {
  const july = buildMonth(2026, 6);

  it("is always six rows of seven, so the grid never changes height", () => {
    expect(july.weeks).toHaveLength(6);
    for (const week of july.weeks) expect(week).toHaveLength(7);
  });

  it("starts on a Monday", () => {
    const weekday = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Brisbane",
      weekday: "long",
    }).format(new Date(`${july.weeks[0][0].date}T00:00:00+10:00`));
    expect(weekday).toBe("Monday");
  });

  it("marks padding days as outside the month", () => {
    const padding = july.weeks.flat().filter((cell) => !cell.inMonth);
    // July 2026 starts on a Wednesday, so there is padding on both sides.
    expect(padding.length).toBeGreaterThan(0);
    for (const cell of padding) expect(isoParts(cell.date).month).not.toBe(6);
  });

  it("contains every day of the month exactly once", () => {
    const inMonth = july.weeks.flat().filter((cell) => cell.inMonth);
    expect(inMonth).toHaveLength(31);
    expect(new Set(inMonth.map((cell) => cell.date)).size).toBe(31);
  });

  it("runs consecutively with no gaps or repeats", () => {
    const days = july.weeks.flat();
    for (let i = 1; i < days.length; i += 1) {
      expect(days[i].date).toBe(addDays(days[i - 1].date, 1));
    }
  });

  it("labels the day of the month from the date, not the grid position", () => {
    for (const cell of july.weeks.flat()) {
      expect(cell.dayOfMonth).toBe(isoParts(cell.date).day);
    }
  });

  it("carries the programme week and phase, and leaves them null outside it", () => {
    const before = july.weeks.flat().find((cell) => cell.date < ANNUAL_START);
    expect(before?.week).toBeNull();
    expect(before?.phase).toBeNull();
    const first = july.weeks.flat().find((cell) => cell.date === ANNUAL_START);
    expect(first?.week).toBe(1);
    expect(first?.phase?.id).toBe(LEGACY_PHASES[0].id);
  });

  it("handles a month that begins on a Monday without a blank first row", () => {
    // 1 February 2027 is a Monday.
    const february = buildMonth(2027, 1);
    expect(february.weeks[0][0].date).toBe("2027-02-01");
    expect(february.weeks[0][0].inMonth).toBe(true);
  });
});

describe("programmeMonths", () => {
  const months = programmeMonths();

  it("covers the first and last day of the programme", () => {
    expect(months[0].key).toBe("2026-07");
    const lastDay = addDays(weekStart(PROGRAMME_WEEK_COUNT), 6);
    expect(months[months.length - 1].key).toBe(lastDay.slice(0, 7));
  });

  it("is consecutive, with no month skipped or repeated", () => {
    const keys = months.map((month) => month.key);
    expect(new Set(keys).size).toBe(keys.length);
    // Counting in months rather than comparing strings, so December to
    // January is the same step as any other.
    for (let i = 1; i < keys.length; i += 1) {
      const [previousYear, previousMonth] = keys[i - 1].split("-").map(Number);
      const [year, month] = keys[i].split("-").map(Number);
      expect(year * 12 + month).toBe(previousYear * 12 + previousMonth + 1);
    }
  });

  it("gives each grid the month its key names", () => {
    for (const month of months) {
      const own = month.weeks.flat().filter((cell) => cell.inMonth);
      expect(own.length).toBeGreaterThan(27);
      for (const cell of own) expect(cell.date.slice(0, 7)).toBe(month.key);
    }
  });

  it("crosses the new year", () => {
    expect(months.map((month) => month.key)).toContain("2026-12");
    expect(months.map((month) => month.key)).toContain("2027-01");
  });
});

describe("monthContaining", () => {
  it("returns the grid for the date's own month", () => {
    expect(monthContaining("2026-12-25").key).toBe("2026-12");
    expect(monthContaining(ANNUAL_START).key).toBe("2026-07");
  });
});

describe("phases", () => {
  it("covers all 52 weeks with no gap and no overlap", () => {
    const sorted = [...LEGACY_PHASES].sort((a, b) => a.startWeek - b.startWeek);
    expect(sorted[0].startWeek).toBe(1);
    expect(sorted[sorted.length - 1].endWeek).toBe(PROGRAMME_WEEK_COUNT);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].startWeek).toBe(sorted[i - 1].endWeek + 1);
    }
  });

  it("gives every programme week exactly one phase", () => {
    for (let week = 1; week <= PROGRAMME_WEEK_COUNT; week += 1) {
      const matches = LEGACY_PHASES.filter(
        (phase) => week >= phase.startWeek && week <= phase.endWeek
      );
      expect(matches).toHaveLength(1);
      expect(phaseForWeek(week)?.id).toBe(matches[0].id);
    }
  });

  it("has no phase for a week outside the programme", () => {
    expect(phaseForWeek(null)).toBeNull();
    expect(phaseForWeek(0)).toBeNull();
    expect(phaseForWeek(PROGRAMME_WEEK_COUNT + 1)).toBeNull();
  });

  it("spans real dates that join end to end", () => {
    const spans = phaseSpans();
    expect(spans[0].start).toBe(ANNUAL_START);
    for (let i = 1; i < spans.length; i += 1) {
      expect(spans[i].start).toBe(addDays(spans[i - 1].end, 1));
    }
    expect(spans.reduce((total, span) => total + span.weeks, 0)).toBe(PROGRAMME_WEEK_COUNT);
  });

  it("gives each phase a distinct id", () => {
    expect(new Set(LEGACY_PHASES.map((phase) => phase.id)).size).toBe(LEGACY_PHASES.length);
  });
});
