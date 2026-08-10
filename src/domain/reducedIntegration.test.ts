import { describe, expect, it } from "vitest";
import { buildSession, weekPlan } from "./programmeSessions";
import { applyBaselineProgramming } from "./programmeUpdates";

/**
 * The point of the whole module, checked against real programme sessions
 * rather than hand-written strings: after a readiness reduction, no task
 * should still be telling the athlete to do the arithmetic themselves.
 */
describe("a real reduced session states its numbers", () => {
  const built = (level: "reduced" | "recovery") =>
    applyBaselineProgramming(
      buildSession(weekPlan(5), 0, {
        risk: "yellow",
        adjustment: { planLevel: level, workloadFactor: level === "reduced" ? 0.75 : 0.5 },
      }),
      level
    );

  it("leaves no do-the-maths instruction on a reduced day", () => {
    const vague = built("reduced").tasks.filter((t) =>
      /Remove the final work set|about 75% of|about 50% of|Remove one set/i.test(t.prescription)
    );
    expect(vague.map((t) => `${t.name}: ${t.prescription}`)).toEqual([]);
  });

  it("states a concrete dose for the lifts", () => {
    const tasks = built("reduced").tasks;
    const deadlift = tasks.find((t) => t.name === "Trap bar deadlift");
    // 6 × 2 @ 120 kg becomes one fewer set at 90% of the load.
    expect(deadlift?.prescription).toBe("5 × 2 · 107.5 kg · cap RPE 7");
    const split = tasks.find((t) => /split squat/i.test(t.name));
    expect(split?.prescription).toMatch(/^2 × 5\/leg/);
  });

  it("gives most adapted tasks a number rather than a paragraph", () => {
    const adapted = built("reduced").tasks.filter((t) => t.adapted);
    expect(adapted.length).toBeGreaterThan(3);
    const withNumbers = adapted.filter((t) =>
      /\d+\s*×\s*\d+|total throws|minutes|\d+\s*s\b/.test(t.prescription)
    );
    expect(withNumbers.length).toBe(adapted.length);
  });

  it("keeps the original prescription recoverable", () => {
    for (const task of built("reduced").tasks.filter((t) => t.adapted)) {
      expect(String(task.adaptationNote)).toMatch(/^Original plan:/);
      expect(String(task.adaptationNote)).toMatch(/Reduced to /);
    }
  });

  it("does the same on a recovery day", () => {
    const vague = built("recovery").tasks.filter((t) =>
      /about 50% of the assigned volume|Complete about/i.test(t.prescription)
    );
    expect(vague.map((t) => t.name)).toEqual([]);
  });

  it("changes nothing when readiness has not reduced the plan", () => {
    const full = applyBaselineProgramming(buildSession(weekPlan(5), 0, {}), null);
    const deadlift = full.tasks.find((t) => t.name === "Trap bar deadlift");
    expect(deadlift?.prescription).not.toMatch(/cap RPE 7$/);
  });
});
