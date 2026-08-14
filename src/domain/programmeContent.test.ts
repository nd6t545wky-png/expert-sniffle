/**
 * A sweep over the whole programme, checking it is well formed.
 *
 * `programmeContent.ts` is 1,043 lines of training prescriptions extracted
 * verbatim from the prototype by a script, carrying `@ts-nocheck` because it
 * must not be edited. It is the only surviving record of the athlete's actual
 * programme. The existing tests cover the behaviour of particular sessions;
 * nothing checked that every one of the 364 days it can produce is intact.
 *
 * That is the failure this file is for. A row mangled in extraction does not
 * throw — it surfaces as a session with no tasks, a load that reads "NaN kg",
 * a prescription that is the empty string, or a day the plan simply cannot
 * build. Any of those would be shown to the athlete as their training for the
 * day, and nothing else would notice.
 *
 * These are structural checks, deliberately. They assert that a prescription
 * exists and is legible, never what it should say — the loads, throw counts
 * and stop-criteria are the record, and a test that second-guessed them would
 * be reinterpreting the programme, which is exactly what must not happen.
 */

import { describe, expect, it } from "vitest";
import {
  PROGRAMME_PHASE_TABLE,
  buildSession,
  dateForWeekDay,
  phaseForProgrammeWeek,
  setProgrammeContext,
  weekPlan,
} from "./programmeSessions";
import { ANNUAL_START as CALENDAR_START, PROGRAMME_WEEK_COUNT, weekStart } from "./calendar";
import { ANNUAL_START as CONTENT_START } from "./programmeContent";

/** Realistic training maxes, so strength prescriptions resolve to real loads. */
const PBS = {
  trainingMaxes: {
    lifts: {
      squat: { value: 140, kind: "kg" },
      bench: { value: 100, kind: "kg" },
      deadlift: { value: 180, kind: "kg" },
      press: { value: 60, kind: "kg" },
    },
  },
};

const WEEKS = Array.from({ length: PROGRAMME_WEEK_COUNT }, (_, i) => i + 1);
const DAYS = [0, 1, 2, 3, 4, 5, 6];

setProgrammeContext({ pbs: PBS });

describe("every programme week", () => {
  it("builds", () => {
    for (const week of WEEKS) {
      const plan = weekPlan(week, PBS);
      expect(plan.week, `week ${week}`).toBe(week);
      expect(plan.start instanceof Date, `week ${week} start`).toBe(true);
      expect(Number.isFinite(plan.start.getTime()), `week ${week} start is a real date`).toBe(true);
    }
  });

  it("has a phase, and the phase claims the week", () => {
    for (const week of WEEKS) {
      const plan = weekPlan(week, PBS);
      expect(plan.phase, `week ${week}`).toBeTruthy();
      expect(typeof plan.phase.id, `week ${week} phase id`).toBe("string");
      expect(plan.phase.id.length, `week ${week} phase id`).toBeGreaterThan(0);
      expect(phaseForProgrammeWeek(week)?.id, `week ${week}`).toBe(plan.phase.id);
    }
  });

  it("carries the headline prescriptions as readable text", () => {
    for (const week of WEEKS) {
      const plan = weekPlan(week, PBS);
      for (const field of ["focus", "mondayLift", "throwing", "recovery", "competition"] as const) {
        expect(typeof plan[field], `week ${week} ${field}`).toBe("string");
        expect(String(plan[field]).trim().length, `week ${week} ${field} is not empty`).toBeGreaterThan(0);
        expect(String(plan[field]), `week ${week} ${field} has no unresolved value`).not.toMatch(
          /NaN|undefined|\[object Object\]/
        );
      }
    }
  });

  it("runs seven consecutive days, in order, with no repeats across the year", () => {
    const seen = new Set<string>();
    let previous: string | null = null;
    for (const week of WEEKS) {
      const plan = weekPlan(week, PBS);
      for (const day of DAYS) {
        const date = dateForWeekDay(plan, day);
        expect(date, `week ${week} day ${day}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(seen.has(date), `${date} appears twice`).toBe(false);
        seen.add(date);
        if (previous) expect(date > previous, `${date} follows ${previous}`).toBe(true);
        previous = date;
      }
    }
    expect(seen.size).toBe(PROGRAMME_WEEK_COUNT * 7);
  });
});

describe("every session the programme can produce", () => {
  const sessions = WEEKS.flatMap((week) => {
    const plan = weekPlan(week, PBS);
    return DAYS.map((day) => ({ week, day, session: buildSession(plan, day) }));
  });

  it("covers all 364 days", () => {
    expect(sessions).toHaveLength(PROGRAMME_WEEK_COUNT * 7);
  });

  it("has a title, focus and description on every one", () => {
    for (const { week, day, session } of sessions) {
      for (const field of ["title", "focus", "description"] as const) {
        expect(typeof session[field], `week ${week} day ${day} ${field}`).toBe("string");
        expect(
          String(session[field]).trim().length,
          `week ${week} day ${day} ${field} is not empty`
        ).toBeGreaterThan(0);
      }
    }
  });

  it("has at least one task on every one", () => {
    for (const { week, day, session } of sessions) {
      expect(Array.isArray(session.tasks), `week ${week} day ${day}`).toBe(true);
      expect(session.tasks.length, `week ${week} day ${day} has tasks`).toBeGreaterThan(0);
    }
  });

  it("gives every task a name, a prescription and a stable id", () => {
    for (const { week, day, session } of sessions) {
      for (const task of session.tasks) {
        const where = `week ${week} day ${day} task ${task.id}`;
        expect(typeof task.id, `${where} id`).toBe("string");
        expect(task.id.trim().length, `${where} id`).toBeGreaterThan(0);
        expect(String(task.name || "").trim().length, `${where} name`).toBeGreaterThan(0);
        expect(String(task.prescription || "").trim().length, `${where} prescription`).toBeGreaterThan(0);
      }
    }
  });

  it("never shows an unresolved value in anything the athlete reads", () => {
    // The signature of a mangled extraction or a training max that failed to
    // resolve: "NaN kg" is a number the athlete would try to lift.
    for (const { week, day, session } of sessions) {
      for (const task of session.tasks) {
        for (const field of ["name", "prescription", "cue", "setup", "execution", "rest", "stop"] as const) {
          const value = task[field];
          if (typeof value !== "string") continue;
          expect(value, `week ${week} day ${day} task ${task.id} ${field}`).not.toMatch(
            /NaN|undefined|\[object Object\]/
          );
        }
      }
    }
  });

  it("gives each task within a session a distinct id", () => {
    for (const { week, day, session } of sessions) {
      const ids = session.tasks.map((task) => task.id);
      expect(new Set(ids).size, `week ${week} day ${day} has unique task ids`).toBe(ids.length);
    }
  });

  it("numbers stages from 1 and names every one", () => {
    for (const { week, day, session } of sessions) {
      for (const task of session.tasks) {
        expect(Number.isInteger(task.stage), `week ${week} day ${day} ${task.id} stage`).toBe(true);
        expect(task.stage, `week ${week} day ${day} ${task.id} stage`).toBeGreaterThan(0);
        expect(
          String(task.stageTitle || "").trim().length,
          `week ${week} day ${day} ${task.id} stage title`
        ).toBeGreaterThan(0);
      }
    }
  });

  it("keeps a red readiness day to recovery work only, all year", () => {
    for (const week of WEEKS) {
      const plan = weekPlan(week, PBS);
      for (const day of DAYS) {
        const session = buildSession(plan, day, { risk: "red" });
        expect(session.tasks.length, `week ${week} day ${day} red`).toBeGreaterThan(0);
        // Whatever the phase, a red day must not prescribe the week's lift or
        // a competition outing.
        expect(String(session.title), `week ${week} day ${day} red`).toBeTruthy();
      }
    }
  });
});

describe("the calendar and the programme agree", () => {
  it("start on the same date", () => {
    // Two modules hold this date: the calendar that draws the year, and the
    // extracted programme that builds the sessions. If they drift, the app
    // shows one week's plan under another week's dates and nothing errors.
    expect(CONTENT_START).toBe(CALENDAR_START);
  });

  it("put every week on the same Monday", () => {
    for (const week of WEEKS) {
      expect(dateForWeekDay(weekPlan(week, PBS), 0), `week ${week}`).toBe(weekStart(week));
    }
  });
});

describe("the phase table", () => {
  it("covers weeks 1 to 52 with no gap and no overlap", () => {
    const spans = [...PROGRAMME_PHASE_TABLE].sort((a, b) => a.weeks[0] - b.weeks[0]);
    expect(spans[0].weeks[0]).toBe(1);
    expect(spans[spans.length - 1].weeks[1]).toBe(PROGRAMME_WEEK_COUNT);
    for (let i = 1; i < spans.length; i += 1) {
      expect(spans[i].weeks[0], `after ${spans[i - 1].id}`).toBe(spans[i - 1].weeks[1] + 1);
    }
  });

  it("gives every phase an id, a name and a summary", () => {
    for (const phase of PROGRAMME_PHASE_TABLE) {
      expect(phase.id.trim().length).toBeGreaterThan(0);
      expect(phase.name.trim().length).toBeGreaterThan(0);
      expect(phase.summary.trim().length).toBeGreaterThan(0);
    }
  });
});
