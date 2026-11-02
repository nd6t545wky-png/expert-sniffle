import { describe, expect, it } from "vitest";
import { buildSession, weekPlan } from "./programmeSessions";

const BREAK = [22, 23, 24, 25];
const moundPitches = (week: number) =>
  Array.from({ length: 7 }, (_, d) => buildSession(weekPlan(week), d, {}))
    .flatMap((s) => s.tasks)
    .filter((t) => t.stageTitle === "Throw" && /pitch/.test(String(t.prescription)) && /bullpen|mound|simulated/i.test(String(t.name)))
    .map((t) => {
      const sim = /(\d+) innings × (\d+) pitches/.exec(String(t.prescription));
      if (sim) return Number(sim[1]) * Number(sim[2]);
      return Number(/[–-](\d+) pitches/.exec(String(t.prescription))?.[1] ?? 0);
    });

describe("throwing over the Christmas break", () => {
  it("is in the break weeks", () => {
    for (const week of BREAK) expect(weekPlan(week).phase.id).toBe("summer_break");
  });

  it("keeps the mound in every week of the break", () => {
    for (const week of BREAK) expect(moundPitches(week).length).toBeGreaterThan(0);
  });

  it("builds the top pitch count each week to a game's worth before games resume", () => {
    const tops = BREAK.map((week) => Math.max(...moundPitches(week)));
    for (let i = 1; i < tops.length; i += 1) expect(tops[i]).toBeGreaterThan(tops[i - 1]);
    expect(tops[tops.length - 1]).toBeGreaterThanOrEqual(45);
  });

  it("keeps throwing most days, even in the unload week", () => {
    const days = Array.from({ length: 7 }, (_, d) => buildSession(weekPlan(22), d, {})).filter((s) =>
      s.tasks.some((t) => t.stageTitle === "Throw")
    );
    expect(days.length).toBeGreaterThanOrEqual(5);
  });

  it("leaves in-season weeks alone", () => {
    const before = buildSession(weekPlan(21), 2, {});
    expect(before.tasks.some((t) => /Simulated game|Mound touch/.test(String(t.name)))).toBe(false);
  });
});
