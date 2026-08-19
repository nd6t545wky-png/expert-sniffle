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
import { FIXTURES, daysUntil, fixtureOn, upcomingFixtures } from "./fixtures";
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
