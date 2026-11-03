import { describe, expect, it } from "vitest";
import { buildSession, weekPlan } from "./programmeSessions";
import { asPositionPlayer, isPitchingTask } from "./positionPlayer";

describe("asPositionPlayer", () => {
  it("removes every pitching task across a season and keeps the gym", () => {
    let gym = 0;
    for (const week of [5, 20, 30, 40]) {
      for (let day = 0; day < 7; day++) {
        const session = asPositionPlayer(buildSession(weekPlan(week), day, {} as never));
        expect(session.tasks.some(isPitchingTask)).toBe(false);
        expect(session.tasks.some((task) => /plyo|bullpen|pulldown/i.test(String(task.name)))).toBe(false);
        gym += session.tasks.filter((task) => /Whole-Body|Strength/.test(task.stageTitle)).length;
      }
    }
    expect(gym).toBeGreaterThan(0);
  });

  it("rewords the game for at-bats", () => {
    for (const week of [30, 40]) {
      for (let day = 0; day < 7; day++) {
        const session = asPositionPlayer(buildSession(weekPlan(week), day, {} as never));
        for (const task of session.tasks.filter((t) => t.stageTitle === "Compete")) {
          expect(task.name).toBe("Game - at-bats");
          expect(task.prescription).toMatch(/Hitting tab/);
        }
      }
    }
  });
});

describe("asPositionPlayer copy", () => {
  it("never describes the day in pitching terms", () => {
    for (const week of [5, 20, 30, 40]) {
      for (let day = 0; day < 7; day++) {
        const session = asPositionPlayer(buildSession(weekPlan(week), day, {} as never));
        expect(String(session.description)).not.toMatch(/bullpen|pulldown|plyo/i);
        expect(String(session.focus)).not.toMatch(/bullpen|pulldown|plyo/i);
      }
    }
  });
});
