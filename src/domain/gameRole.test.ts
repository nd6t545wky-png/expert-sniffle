import { describe, expect, it } from "vitest";
import { buildSession, readGameRole, sessionHasGame, weekPlan } from "./programmeSessions";
import { applyBaselineProgramming } from "./programmeUpdates";

// Week 13 is Round 2: Friday 9 and Sunday 11 October. Day 4 is the Friday.
const plan = () => weekPlan(13);
const friday = (role?: "pitching" | "playing" | "not_playing") =>
  applyBaselineProgramming(buildSession(plan(), 4, { game: true, role }), null, 4);
const names = (role?: "pitching" | "playing" | "not_playing") => friday(role).tasks.map((task) => String(task.name));

describe("are you playing today?", () => {
  it("leaves the game day as written when pitching or unanswered", () => {
    expect(friday("pitching")).toEqual(friday());
    expect(names("pitching")).toContain("Pregame catch and bullpen");
  });

  it("drops the pregame bullpen when playing but not pitching", () => {
    const session = friday("playing");
    expect(sessionHasGame(session)).toBe(true);
    expect(names("playing")).toContain("Pregame catch");
    expect(names("playing").some((name) => /bullpen/i.test(name))).toBe(false);
    const game = session.tasks.find((task) => task.stageTitle === "Compete")!;
    expect(game.prescription).toMatch(/Not scheduled to pitch/);
  });

  it("swaps the game for a light catch when not playing", () => {
    const session = friday("not_playing");
    expect(session.title).toBe("Friday · Not Playing");
    expect(sessionHasGame(session)).toBe(false);
    expect(names("not_playing")).toContain("Light catch");
    expect(names("not_playing").some((name) => /pregame|sprint build|game appearance/i.test(name))).toBe(false);
    // Stages stay in order: the catch sits where the game's throwing was.
    const stages = session.tasks.map((task) => Number(task.stage));
    expect([...stages].sort((a, b) => a - b)).toEqual(stages);
  });

  it("does nothing on a day with no game", () => {
    const monday = buildSession(plan(), 0, { role: "not_playing" });
    expect(monday).toEqual(buildSession(plan(), 0));
  });

  it("reshapes a game the athlete entered on a non-game day too", () => {
    // Tuesday with a fixture entered: built as a game day, then the answer applies.
    const tuesday = buildSession(plan(), 1, { game: true, role: "not_playing" });
    expect(tuesday.title).toBe("Tuesday · Not Playing");
  });

  it("reads only the three answers", () => {
    expect(readGameRole("playing")).toBe("playing");
    expect(readGameRole("starting")).toBeNull();
    expect(readGameRole(undefined)).toBeNull();
  });
});
