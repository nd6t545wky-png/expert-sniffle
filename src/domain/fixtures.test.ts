/**
 * The fixture list, checked for shape rather than for content.
 *
 * The dates themselves are a record recovered from a deployed build, and a
 * test that asserted a particular round fell on a particular Saturday would be
 * asserting that the draw has not changed — which is not something a test can
 * know. What is checked here is that the list is well formed, ordered, and
 * honest about where each entry came from.
 */

import { describe, expect, it } from "vitest";
import { FIXTURES, allFixtures, daysUntil, fixtureOn, readAthleteFixtures, scheduleClash, upcomingFixtures } from "./fixtures";
import { isIsoDate } from "./state";

describe("the fixture list", () => {
  it("is a list of real dates, in order, with no repeats", () => {
    const dates = FIXTURES.map((fixture) => fixture.date);
    for (const date of dates) expect(isIsoDate(date), date).toBe(true);
    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort()).toEqual(dates);
  });

  it("gives every fixture an id, a team, a label and a provenance", () => {
    for (const fixture of FIXTURES) {
      expect(fixture.id.trim().length, fixture.id).toBeGreaterThan(0);
      expect(fixture.team.trim().length, fixture.id).toBeGreaterThan(0);
      expect(fixture.label.trim().length, fixture.id).toBeGreaterThan(0);
      expect(["official", "athlete-provided"], fixture.id).toContain(fixture.source);
    }
    expect(new Set(FIXTURES.map((fixture) => fixture.id)).size).toBe(FIXTURES.length);
  });

  it("says which entries are the draw and which the athlete supplied", () => {
    // The distinction is the point of carrying a source at all: it is what
    // stops a date typed in from being read as an official fixture.
    expect(FIXTURES.some((fixture) => fixture.source === "official")).toBe(true);
    expect(FIXTURES.some((fixture) => fixture.source === "athlete-provided")).toBe(true);
  });
});

describe("finding a fixture", () => {
  it("finds one on its own day and nothing on any other", () => {
    const first = FIXTURES[0];
    expect(fixtureOn(first.date)).toEqual(first);
    expect(fixtureOn("2026-07-19")).toBeNull();
    expect(fixtureOn("not a date")).toBeNull();
  });

  it("counts a game day as upcoming, not as passed", () => {
    const first = FIXTURES[0];
    expect(upcomingFixtures(first.date)[0]).toEqual(first);
    expect(daysUntil(first.date, first)).toBe(0);
  });

  it("returns the next ones, soonest first", () => {
    const next = upcomingFixtures("2026-08-19", 2);
    expect(next).toHaveLength(2);
    expect(next[0].date < next[1].date).toBe(true);
    expect(next.every((fixture) => fixture.date >= "2026-08-19")).toBe(true);
  });

  it("returns nothing once the season is over", () => {
    expect(upcomingFixtures("2027-01-01")).toEqual([]);
  });

  it("counts the days to one, and past it", () => {
    const first = FIXTURES[0];
    expect(daysUntil("2026-07-11", first)).toBe(7);
    expect(daysUntil("2026-07-19", first)).toBe(-1);
  });
});

describe("the rest of the season, entered by the athlete", () => {
  const entry = [
    { id: "athlete-1", date: "2026-09-12", team: "Norths", label: "Semi-final", source: "athlete-provided" as const },
  ];

  it("reads entries defensively and drops anything undated", () => {
    const read = readAthleteFixtures([
      { date: "2026-09-12", label: "Semi-final", team: "Norths" },
      { label: "no date" },
      "nonsense",
      null,
    ]);
    expect(read).toHaveLength(1);
    expect(read[0]).toMatchObject({ date: "2026-09-12", label: "Semi-final", source: "athlete-provided" });
  });

  it("fills in a sensible label and team rather than rendering blanks", () => {
    const read = readAthleteFixtures([{ date: "2026-09-12" }]);
    expect(read[0].label).toBe("Game");
    expect(read[0].team).toBeTruthy();
  });

  it("merges over the built-in draw without losing it", () => {
    const merged = allFixtures(entry);
    expect(merged).toHaveLength(FIXTURES.length + 1);
    expect(merged.map((f) => f.date)).toEqual([...merged.map((f) => f.date)].sort());
    expect(merged.find((f) => f.id === "fncba-2026-r19")?.source).toBe("official");
  });

  it("keeps provenance on both, because they are different kinds of fact", () => {
    const merged = allFixtures(entry);
    expect(merged.find((f) => f.id === "athlete-1")?.source).toBe("athlete-provided");
  });

  it("is visible to fixtureOn and upcomingFixtures once merged", () => {
    const merged = allFixtures(entry);
    expect(fixtureOn("2026-09-12" as never, merged)?.label).toBe("Semi-final");
    // The Cubs opener is still ahead of it, so the entered final leads the list
    // rather than being the whole of it.
    expect(upcomingFixtures("2026-09-06" as never, 5, merged).map((f) => f.date)).toEqual([
      "2026-09-12",
      "2026-10-02",
    ]);
  });
});

describe("a game in a week planned as rest", () => {
  const week = {
    start: "2026-09-07" as never,
    end: "2026-09-13" as never,
    phaseId: "transition",
    phaseName: "Post-Winter Transition",
  };

  it("is exactly the finals case, and it says so", () => {
    const merged = allFixtures([
      { id: "a", date: "2026-09-12" as never, team: "Norths", label: "Semi-final", source: "athlete-provided" },
    ]);
    const clash = scheduleClash(week, merged);
    expect(clash).toBeTruthy();
    expect(clash!.message).toMatch(/Semi-final/);
    expect(clash!.message).toMatch(/Post-Winter Transition/);
    expect(clash!.message).toMatch(/no game in them/);
  });

  it("says nothing when the week is empty, which is most of them", () => {
    expect(scheduleClash(week, allFixtures())).toBeNull();
  });

  it("says nothing about an in-season week, where a game is the point", () => {
    const inSeason = { ...week, start: "2026-08-24" as never, end: "2026-08-30" as never, phaseId: "winter", phaseName: "FNCBA Winter · In Season" };
    expect(scheduleClash(inSeason, allFixtures())).toBeNull();
  });

  it("covers every phase that assumes no league game", () => {
    for (const phaseId of ["transition", "transition_summer", "preseason", "summer_break"]) {
      const merged = allFixtures([
        { id: "x", date: "2026-09-10" as never, team: "Norths", label: "Final", source: "athlete-provided" },
      ]);
      expect(scheduleClash({ ...week, phaseId }, merged)).toBeTruthy();
    }
  });
});
