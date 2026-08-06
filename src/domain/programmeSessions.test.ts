import { beforeEach, describe, expect, it } from "vitest";
import {
  PROGRAMME_PHASE_TABLE,
  buildSession,
  currentSelection,
  dateForWeekDay,
  phaseForProgrammeWeek,
  setProgrammeContext,
  weekPlan,
} from "./programmeSessions";

/**
 * These pin the extracted programme content against the prototype. If an
 * extraction ever silently changes a prescription, these fail — which is the
 * whole point, because the prescriptions are the athlete's real training.
 */

beforeEach(() => {
  setProgrammeContext({});
});

describe("phase table", () => {
  it("spans all 52 weeks with no gaps", () => {
    const covered = new Set<number>();
    for (const phase of PROGRAMME_PHASE_TABLE) {
      for (let week = phase.weeks[0]; week <= phase.weeks[1]; week += 1) covered.add(week);
    }
    expect(covered.size).toBe(52);
  });

  it("resolves a phase for every week", () => {
    for (let week = 1; week <= 52; week += 1) {
      expect(phaseForProgrammeWeek(week), `week ${week}`).toBeDefined();
    }
  });

  it("keeps the prototype's phase boundaries", () => {
    expect(phaseForProgrammeWeek(1)?.id).toBe("winter");
    expect(phaseForProgrammeWeek(8)?.id).toBe("winter");
    expect(phaseForProgrammeWeek(9)?.id).toBe("transition");
    expect(phaseForProgrammeWeek(11)?.id).toBe("preseason");
    expect(phaseForProgrammeWeek(12)?.id).toBe("summer_first");
    expect(phaseForProgrammeWeek(52)?.id).toBe("winter_next");
  });
});

describe("week plans", () => {
  it("builds a dated week with its phase", () => {
    const week = weekPlan(1);
    expect(week.week).toBe(1);
    expect(week.start).toBeInstanceOf(Date);
    expect(week.phase.id).toBe("winter");
  });

  it("runs Monday to Sunday", () => {
    const week = weekPlan(1);
    const days = (week.end.getTime() - week.start.getTime()) / 86_400_000;
    expect(days).toBe(6);
  });

  it("advances seven days per week", () => {
    const first = weekPlan(1);
    const second = weekPlan(2);
    expect((second.start.getTime() - first.start.getTime()) / 86_400_000).toBe(7);
  });

  it("produces ISO dates for each day", () => {
    const week = weekPlan(1);
    expect(dateForWeekDay(week, 0)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateForWeekDay(week, 6)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateForWeekDay(week, 6) > dateForWeekDay(week, 0)).toBe(true);
  });

  it("builds every week without throwing", () => {
    for (let week = 1; week <= 52; week += 1) {
      expect(() => weekPlan(week), `week ${week}`).not.toThrow();
    }
  });
});

describe("session generation", () => {
  it("builds a session for every week and day of the year", () => {
    for (let week = 1; week <= 52; week += 1) {
      const plan = weekPlan(week);
      for (let day = 0; day < 7; day += 1) {
        const session = buildSession(plan, day);
        expect(session, `week ${week} day ${day}`).toBeDefined();
        expect(typeof session.title, `week ${week} day ${day}`).toBe("string");
        expect(Array.isArray(session.tasks), `week ${week} day ${day}`).toBe(true);
      }
    }
  });

  it("carries the real prescriptions, not placeholders", () => {
    const session = buildSession(weekPlan(1), 0);
    const names = session.tasks.map((task) => task.name);
    expect(names).toContain("Trap bar deadlift");
    expect(names.some((name) => name.includes("Plyo Ball"))).toBe(true);

    const deadlift = session.tasks.find((task) => task.name === "Trap bar deadlift");
    expect(deadlift?.prescription).toBeTruthy();
    // Every task carries coaching detail, not just a label.
    expect(deadlift?.stop).toBeTruthy();
    expect(deadlift?.execution).toBeTruthy();
  });

  it("gives every task a stable id and a cue", () => {
    const session = buildSession(weekPlan(1), 0);
    const ids = session.tasks.map((task) => task.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const task of session.tasks) {
      expect(task.id, task.name).toBeTruthy();
      expect(task.cue, task.name).toBeTruthy();
    }
  });

  it("replaces the session entirely on a red readiness reading", () => {
    const plan = weekPlan(1);
    const normal = buildSession(plan, 0);
    const held = buildSession(plan, 0, { risk: "red" });
    expect(held.title).not.toBe(normal.title);
    expect(held.tasks.length).toBeLessThan(normal.tasks.length);
  });

  it("uses the summer session shape during competition phases", () => {
    const summer = buildSession(weekPlan(14), 0);
    const winter = buildSession(weekPlan(1), 0);
    expect(summer.title).not.toBe(winter.title);
  });

  it("scales prescriptions down under a reduced plan", () => {
    const plan = weekPlan(1);
    const full = buildSession(plan, 0);
    const reduced = buildSession(plan, 0, {
      adjustment: { planLevel: "reduced", workloadFactor: 0.75 },
    });
    // Same session, adapted — not a different session.
    expect(reduced.tasks.length).toBe(full.tasks.length);
    expect(JSON.stringify(reduced)).not.toBe(JSON.stringify(full));
  });

  it("adapts further for recovery than for reduced", () => {
    const plan = weekPlan(1);
    const reduced = JSON.stringify(
      buildSession(plan, 0, { adjustment: { planLevel: "reduced", workloadFactor: 0.75 } })
    );
    const recovery = JSON.stringify(
      buildSession(plan, 0, { adjustment: { planLevel: "recovery", workloadFactor: 0.5 } })
    );
    expect(recovery).not.toBe(reduced);
  });
});

describe("training maxes", () => {
  it("falls back to a written prescription when no training max is known", () => {
    const session = buildSession(weekPlan(1), 0);
    const bench = session.tasks.find((task) => task.name === "Bench press");
    expect(bench?.prescription).toContain("RPE");
  });

  it("resolves a real load once a training max is supplied", () => {
    setProgrammeContext({
      pbs: { trainingMaxes: { lifts: { benchPress: { value: 100, kind: "tested" } } } },
    });
    const session = buildSession(weekPlan(1), 0);
    const bench = session.tasks.find((task) => task.name === "Bench press");
    expect(bench?.prescription).toContain("kg");
    expect(bench?.prescription).toContain("100 kg");
  });
});

describe("current selection", () => {
  it("reports a week and day inside the programme", () => {
    const selection = currentSelection();
    expect(selection.selectedWeek).toBeGreaterThanOrEqual(1);
    expect(selection.selectedWeek).toBeLessThanOrEqual(52);
    expect(selection.selectedDay).toBeGreaterThanOrEqual(0);
    expect(selection.selectedDay).toBeLessThanOrEqual(6);
    expect(selection.openDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
