/**
 * The GBL draw against the days the programme builds.
 *
 * Every 26/27 round is Friday and Sunday except Round 11 — Wednesday 6 January
 * and Sunday 10 January. The summer template is written for Friday games, so
 * before this week was handled the app showed a game on Friday 8 January,
 * which has nothing on it, and a bullpen on the night of the real game.
 */

import { describe, expect, it } from "vitest";
import { addDays, programmeWeekFor } from "./calendar";
import { FIXTURES, GBL_ROUNDS_2026_27, fixtureOn } from "./fixtures";
import { buildSession, dateForWeekDay, sessionHasGame, weekPlan } from "./programmeSessions";
import { applyBaselineProgramming } from "./programmeUpdates";
import { IsoDate } from "./state";

/** The session the app shows on a date, with the fixture list threaded in as the app does. */
function sessionOn(date: IsoDate) {
  const week = programmeWeekFor(date)!;
  const plan = weekPlan(week);
  const day = [0, 1, 2, 3, 4, 5, 6].find((d) => dateForWeekDay(plan, d) === date)!;
  return applyBaselineProgramming(
    buildSession(plan, day, {
      game: fixtureOn(date, FIXTURES) !== null,
      gameTomorrow: fixtureOn(addDays(date, 1), FIXTURES) !== null,
    }),
    null,
    day
  );
}

const names = (date: IsoDate) => sessionOn(date).tasks.map((task) => String(task.name));

describe("Round 11: Wednesday and Sunday", () => {
  it("is the only round whose first game is not a Friday", () => {
    const midweek = GBL_ROUNDS_2026_27.filter(
      (round) => new Date(`${round.dates[0]}T00:00:00Z`).getUTCDay() !== 5
    );
    expect(midweek.map((round) => [round.round, round.dates[0]])).toEqual([[11, "2027-01-06"]]);
  });

  it("puts the game on Wednesday and none on Friday", () => {
    expect(sessionHasGame(sessionOn("2027-01-06" as IsoDate))).toBe(true);
    expect(sessionOn("2027-01-06" as IsoDate).title).toBe("Wednesday · Game Day");
    expect(sessionHasGame(sessionOn("2027-01-08" as IsoDate))).toBe(false);
    expect(sessionHasGame(sessionOn("2027-01-10" as IsoDate))).toBe(true);
  });

  it("runs the athlete's rhythm two days earlier", () => {
    expect(sessionOn("2027-01-05" as IsoDate).title).toBe("Tuesday · Team Training");
    expect(names("2027-01-05" as IsoDate)).toContain("Light catch");
    expect(names("2027-01-07" as IsoDate)).toContain("Recovery catch only — optional");
    expect(sessionOn("2027-01-08" as IsoDate).title).toBe("Friday · Bullpen + Whole-Body Strength");
    expect(names("2027-01-08" as IsoDate)).toContain("Bullpen");
    expect(names("2027-01-08" as IsoDate)).toContain("Trap bar deadlift");
    expect(sessionOn("2027-01-09" as IsoDate).title).toBe("Saturday · Sunday Primer");
  });

  it("does not swap the day before the game for the generic primer", () => {
    expect(sessionOn("2027-01-05" as IsoDate).tasks.some((task) => task.stageTitle === "Whole-Body Primer")).toBe(false);
  });

  it("keeps the Thursday after the game free of microdoses", () => {
    const thursday = names("2027-01-07" as IsoDate);
    expect(thursday.some((name) => /microdose|depth jump/i.test(name))).toBe(false);
    // Still primed in the warm-up, since no reactive dose replaces it.
    expect(thursday.some((name) => /Ankle stiffness pogos/.test(name))).toBe(true);
  });

  it("gives the week its reactive work on the gym day", () => {
    expect(names("2027-01-08" as IsoDate).some((name) => /depth jump/i.test(name))).toBe(true);
  });

  it("says why the week is different", () => {
    expect(sessionOn("2027-01-08" as IsoDate).description).toMatch(/Wednesday-night game/);
    expect(JSON.stringify(sessionOn("2027-01-08" as IsoDate).tasks)).not.toMatch(/clear of Friday/);
  });
});

describe("every GBL round", () => {
  it("is a game day on each published date and on no other summer day", () => {
    const gameDates = new Set(GBL_ROUNDS_2026_27.flatMap((round) => [...round.dates]));
    for (const round of GBL_ROUNDS_2026_27) {
      const plan = weekPlan(programmeWeekFor(round.dates[0])!);
      for (let day = 0; day < 7; day += 1) {
        const date = dateForWeekDay(plan, day);
        expect(sessionHasGame(sessionOn(date)), `${date} (Round ${round.round})`).toBe(gameDates.has(date));
      }
    }
  });

  it("keeps Thursday's light catch before a Friday game", () => {
    // 9 October is Round 2. The fixture list knows Friday is a game, and the
    // programme's own day before it is the light catch, not the generic primer.
    expect(sessionOn("2026-10-08" as IsoDate).title).toBe("Thursday · Team Training");
    expect(names("2026-10-08" as IsoDate)).toContain("Light catch");
    expect(sessionOn("2026-10-10" as IsoDate).title).toBe("Saturday · Sunday Primer");
  });
});
