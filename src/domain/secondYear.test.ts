import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The year after the first: every day still builds, on the new year's dates.
describe("the second programme year", () => {
  beforeAll(() => {
    process.env.PROGRAMME_LIVE_CLOCK = "1";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-09-01T02:00:00Z"));
    vi.resetModules();
  });
  afterAll(() => {
    delete process.env.PROGRAMME_LIVE_CLOCK;
    vi.useRealTimers();
    vi.resetModules();
  });

  it("has a current week and builds all 52", async () => {
    const { buildSession, currentSelection, dateForWeekDay, weekPlan, withSeasonFromDraw } = await import("./programmeSessions");
    const { applyBaselineProgramming } = await import("./programmeUpdates");
    const today = currentSelection();
    expect(today.selectedWeek).toBe(8);
    expect(dateForWeekDay(weekPlan(1), 0)).toBe("2027-07-12");
    const draw = { dates: ["2027-10-01", "2028-02-27"] as never[], league: "GBL", winterBall: false };
    for (let week = 1; week <= 52; week += 1) {
      for (const plan of [weekPlan(week), withSeasonFromDraw(weekPlan(week), draw)]) {
        for (let day = 0; day < 7; day += 1) {
          expect(applyBaselineProgramming(buildSession(plan, day), null, day).tasks.length, `week ${week} day ${day}`).toBeGreaterThan(0);
        }
      }
    }
  });
});
