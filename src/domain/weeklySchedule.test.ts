import { describe, expect, it } from "vitest";
import { buildSession, sessionHasGame, weekPlan } from "./programmeSessions";
import { PROGRAMME_WEEK, WeeklySchedule, dayRoles, readSchedule, weekLine } from "./weeklySchedule";

const SUMMER_WEEK = 17;
const WINTER_NEXT_WEEK = 40;

const week = (n: number) => weekPlan(n);
const day = (n: number, d: number, schedule: WeeklySchedule | null) =>
  buildSession(week(n), d, { schedule });

describe("dayRoles", () => {
  it("matches the programme's own week for Friday and Sunday games", () => {
    expect(dayRoles([4, 6])).toEqual(["post-game", "free", "bullpen", "pre-game", "game", "between", "game"]);
  });

  it("lays the jobs over a Saturday-only week", () => {
    expect(dayRoles([5])).toEqual(["free", "free", "bullpen", "free", "pre-game", "game", "post-game"]);
  });

  it("lets the bullpen fall on a club night", () => {
    expect(dayRoles([5])?.[2]).toBe("bullpen");
  });

  it("has no plan without games", () => {
    expect(dayRoles([])).toBeNull();
  });
});

describe("readSchedule", () => {
  it("reads a stored schedule and rejects a missing one", () => {
    expect(readSchedule({ schedule: { training: [3, 1, 9], games: [5], winterGames: [] } })).toEqual({
      training: [1, 3],
      games: [5],
      winterGames: [],
    });
    expect(readSchedule({})).toBeNull();
  });

  it("writes the week as one line", () => {
    expect(weekLine({ training: [0, 2], games: [5], winterGames: [] })).toBe("Training Mon & Wed · game Sat");
  });
});

describe("the athlete's own week", () => {
  it("leaves the programme untouched for the week it was written around", () => {
    for (let d = 0; d < 7; d += 1) {
      expect(day(SUMMER_WEEK, d, PROGRAMME_WEEK)).toEqual(day(SUMMER_WEEK, d, null));
    }
  });

  it("puts games, bullpen and day off on a Saturday-only week", () => {
    const schedule = { training: [0, 2], games: [5], winterGames: [] };
    const sessions = Array.from({ length: 7 }, (_, d) => day(SUMMER_WEEK, d, schedule));
    expect(sessions.map((s) => sessionHasGame(s))).toEqual([false, false, false, false, false, true, false]);
    expect(sessions[5].title).toBe("Saturday · Game Day");
    expect(sessions[6].title).toMatch(/^Sunday · Recovery/);
    expect(sessions[2].title).toMatch(/^Wednesday · Bullpen/);
    expect(sessions[2].description).toMatch(/well clear of Saturday's game/);
    expect(sessions[4].title).toBe("Friday · Light Catch");
    for (const [d, s] of sessions.entries()) {
      expect(s.description).toMatch(/^Your week: training Mon & Wed · game Sat\./);
      // Every task id stays on its own day, and nothing is duplicated.
      for (const task of s.tasks) expect(task.id).toMatch(new RegExp(`^w${SUMMER_WEEK}-d${d}-`));
      expect(new Set(s.tasks.map((t) => t.id)).size).toBe(s.tasks.length);
    }
  });

  it("only keeps team practice on the athlete's training nights", () => {
    const schedule = { training: [0], games: [4, 6], winterGames: [] };
    const thursday = day(SUMMER_WEEK, 3, schedule);
    expect(thursday.tasks.some((t) => t.stageTitle === "Team Practice")).toBe(false);
    expect(thursday.title).toBe("Thursday · Light Catch");
  });

  it("names the athlete's days, not the programme's, in the write-up", () => {
    const schedule = { training: [1, 3], games: [2, 5], winterGames: [] };
    expect(day(SUMMER_WEEK, 3, schedule).description).toMatch(/day after Wednesday's game/);
    expect(day(SUMMER_WEEK, 4, schedule).description).toMatch(/day before Saturday's game/);
    // The programme's own day names do not leak through.
    expect(day(SUMMER_WEEK, 3, schedule).description).not.toMatch(/Friday|Sunday/);
  });

  it("moves the winter week to the athlete's winter game day", () => {
    const schedule = { training: [1, 3], games: [4, 6], winterGames: [6] };
    const sessions = Array.from({ length: 7 }, (_, d) => day(WINTER_NEXT_WEEK, d, schedule));
    expect(sessions.map((s) => sessionHasGame(s))).toEqual([false, false, false, false, false, false, true]);
    expect(sessions[6].title).toMatch(/^Sunday/);
  });

  it("drops the winter game for an athlete with no winter ball", () => {
    const schedule = { training: [1, 3], games: [4, 6], winterGames: [] };
    const sessions = Array.from({ length: 7 }, (_, d) => day(WINTER_NEXT_WEEK, d, schedule));
    expect(sessions.some((s) => sessionHasGame(s))).toBe(false);
  });
});

describe("a bullpen on a club night", () => {
  it("keeps the bullpen and adds practice alongside it", async () => {
    const { applyTeamTraining } = await import("./teamTraining");
    const schedule = { training: [0, 2], games: [5], winterGames: [] };
    const wednesday = day(SUMMER_WEEK, 2, schedule);
    const date = "2026-11-04" as never;
    const { session, note } = applyTeamTraining(wednesday, {
      day: 2,
      date,
      settings: { days: [0, 2], from: "2026-11-01" as never, club: "Logan Rays" },
    });
    expect(session.tasks.some((t) => /^Bullpen$/.test(String(t.name)))).toBe(true);
    expect(session.tasks.some((t) => t.stageTitle === "Team Practice")).toBe(true);
    expect(session.tasks.some((t) => /practice throwing/i.test(String(t.name)))).toBe(false);
    expect(note).toMatch(/bullpen stays/);
  });
});

describe("a week read off the team's draw", () => {
  it("keeps gym and throwing over Christmas when the league plays through it", () => {
    const breakWeek = 23;
    const bye = { training: [1], games: [], winterGames: [], fromDraw: true, inSeason: true };
    const sessions = Array.from({ length: 7 }, (_, d) => day(breakWeek, d, bye));
    const tasks = sessions.flatMap((s) => s.tasks);
    expect(tasks.filter((t) => /Whole-Body Gym|Strength Maintenance/.test(t.stageTitle)).length).toBeGreaterThan(4);
    expect(tasks.some((t) => /^Bullpen$/.test(String(t.name)))).toBe(true);
    expect(sessions.some((s) => sessionHasGame(s))).toBe(false);
    // Before the season starts or after it ends, the break is the programme's.
    const offSeason = Array.from({ length: 7 }, (_, d) => day(breakWeek, d, { ...bye, inSeason: false }));
    expect(offSeason.map((s) => s.title)).toEqual(Array.from({ length: 7 }, (_, d) => day(breakWeek, d, null).title));
  });

  it("builds an ABL series week: day off Monday, bullpen Tuesday, catch Wednesday", () => {
    const schedule = { training: [1], games: [3, 4, 5, 6], winterGames: [], fromDraw: true };
    const titles = Array.from({ length: 7 }, (_, d) => day(SUMMER_WEEK, d, schedule).title);
    expect(titles[0]).toMatch(/^Monday · Recovery/);
    expect(titles[1]).toMatch(/^Tuesday · Bullpen/);
    expect(titles[2]).toBe("Wednesday · Light Catch");
    expect(titles.slice(3).every((title) => / · Game Day$/.test(title))).toBe(true);
  });

  it("plays a bye week with no game day", () => {
    const schedule = { training: [1, 3], games: [], winterGames: [], fromDraw: true };
    const sessions = Array.from({ length: 7 }, (_, d) => day(SUMMER_WEEK, d, schedule));
    expect(sessions.some((s) => sessionHasGame(s))).toBe(false);
    expect(sessions[2].title).toBe("Wednesday · Bullpen + Whole-Body Strength");
    expect(sessions[1].title).toBe("Tuesday · Team Training");
    expect(sessions.every((s) => /^No game for your team this week/.test(String(s.description)))).toBe(true);
    for (const [d, s] of sessions.entries()) for (const task of s.tasks) expect(task.id).toMatch(new RegExp(`^w${SUMMER_WEEK}-d${d}-`));
  });

  it("plays the draw's games over the programme's Christmas break", () => {
    const breakWeek = 23;
    expect(week(breakWeek).phase.id).toBe("summer_break");
    const schedule = { training: [], games: [4, 5], winterGames: [], fromDraw: true };
    expect(sessionHasGame(day(breakWeek, 4, schedule))).toBe(true);
    // The game week keeps its gym and its throwing.
    const gameWeek = Array.from({ length: 7 }, (_, d) => day(breakWeek, d, schedule));
    expect(gameWeek.some((s) => s.tasks.some((t) => /Whole-Body Gym|Strength Maintenance/.test(t.stageTitle)))).toBe(true);
    expect(gameWeek.some((s) => s.tasks.some((t) => /^Bullpen$/.test(String(t.name))))).toBe(true);
    // Without a draw, the break stays a break.
    expect(sessionHasGame(day(breakWeek, 4, { ...schedule, fromDraw: false }))).toBe(false);
  });
});
