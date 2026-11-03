import { describe, expect, it } from "vitest";
import { addDays } from "./calendar";
import { buildSession, dateForWeekDay, weekPlan, withSeasonFromDraw } from "./programmeSessions";
import { IsoDate } from "./state";

// An ABL-shaped season: Thursday-to-Sunday series, 12 Nov to 24 Jan, through Christmas.
const dates: IsoDate[] = [];
for (let thursday = "2026-11-12" as IsoDate; thursday <= "2027-01-21"; thursday = addDays(thursday, 7)) {
  for (let day = 0; day < 4; day += 1) dates.push(addDays(thursday, day));
}
const draw = { dates, league: "ABL", winterBall: false };
const phaseOn = (date: IsoDate) => {
  for (let week = 1; week <= 52; week += 1) {
    const plan = weekPlan(week);
    if (date >= dateForWeekDay(plan, 0) && date <= dateForWeekDay(plan, 6)) return withSeasonFromDraw(plan, draw).phase;
  }
  throw new Error(date);
};

describe("a season built from the athlete's own draw", () => {
  it("runs pre-season, in season, transition and off-season off their dates, not the owner's", () => {
    expect(phaseOn("2026-08-03").name).toBe("Off-season");
    expect(phaseOn("2026-10-12").name).toBe("ABL · Pre-season");
    expect(phaseOn("2026-11-16").name).toBe("ABL · In season");
    expect(phaseOn("2026-12-28").name).toBe("ABL · In season");
    expect(phaseOn("2027-02-01").name).toBe("Post-season transition");
    expect(phaseOn("2027-04-05").name).toBe("Off-season");
  });

  it("leaves the owner's calendar alone without a draw", () => {
    expect(withSeasonFromDraw(weekPlan(12), null)).toEqual(weekPlan(12));
  });

  it("builds every day of the year", () => {
    for (let week = 1; week <= 52; week += 1) {
      const plan = withSeasonFromDraw(weekPlan(week), draw);
      for (let day = 0; day < 7; day += 1) {
        const games = [0, 1, 2, 3, 4, 5, 6].filter((d) => dates.includes(dateForWeekDay(plan, d)));
        const session = buildSession(plan, day, { schedule: { training: [1], games, winterGames: [], fromDraw: true, inSeason: true } });
        expect(session.tasks.length, `week ${week} day ${day}`).toBeGreaterThan(0);
      }
    }
  });
});
