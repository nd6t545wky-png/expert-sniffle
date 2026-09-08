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
import { DAY_NAMES } from "./session";
import { applyBaselineProgramming } from "./programmeUpdates";

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

describe("a single source of 'today'", () => {
  /**
   * Regression: the app briefly took the date from the device clock and the
   * week/day from the programme calendar. Off Brisbane time those disagree,
   * so a readiness entry saved under one date unlocked a session built for
   * another. These assert the three stay derived from one selection.
   */
  it("returns a date, week and day that describe the same day", () => {
    const selection = currentSelection();
    const plan = weekPlan(selection.selectedWeek);
    expect(dateForWeekDay(plan, selection.selectedDay)).toBe(selection.openDate);
  });

  it("resolves the date in the programme's timezone, not the device's", () => {
    const brisbane = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Brisbane",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    expect(currentSelection().openDate).toBe(brisbane);
  });

  it("puts the day index on the weekday that date actually is in Brisbane", () => {
    const selection = currentSelection();
    const weekday = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Brisbane",
      weekday: "long",
    }).format(new Date());
    const names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    expect(names[selection.selectedDay]).toBe(weekday);
  });
});

describe("day selection cannot drift from its date", () => {
  // The bug this guards against: the heading said one weekday while the date
  // underneath said another, because the two were computed separately. The
  // date is now derived from (week, day), so the derivation is the contract.
  it("gives each day of the week its own consecutive date", () => {
    const plan = weekPlan(5);
    const dates = Array.from({ length: 7 }, (_, day) => dateForWeekDay(plan, day));
    expect(new Set(dates).size).toBe(7);
    for (let i = 1; i < dates.length; i += 1) {
      const previous = new Date(`${dates[i - 1]}T00:00:00+10:00`);
      const current = new Date(`${dates[i]}T00:00:00+10:00`);
      expect((current.getTime() - previous.getTime()) / 86_400_000).toBe(1);
    }
  });

  it("agrees with the weekday name the interface shows for that day", () => {
    const plan = weekPlan(12);
    for (let day = 0; day < 7; day += 1) {
      const iso = dateForWeekDay(plan, day);
      const weekday = new Intl.DateTimeFormat("en-AU", {
        timeZone: "Australia/Brisbane",
        weekday: "long",
      }).format(new Date(`${iso}T00:00:00+10:00`));
      expect(weekday).toBe(DAY_NAMES[day]);
    }
  });

  it("puts today's selection on today's date", () => {
    const today = currentSelection();
    expect(dateForWeekDay(weekPlan(today.selectedWeek), today.selectedDay)).toBe(today.openDate);
  });

  it("never returns the same date for two different weeks", () => {
    const a = dateForWeekDay(weekPlan(5), 0);
    const b = dateForWeekDay(weekPlan(6), 0);
    expect(a).not.toBe(b);
    expect(new Date(`${b}T00:00:00+10:00`).getTime() - new Date(`${a}T00:00:00+10:00`).getTime()).toBe(
      7 * 86_400_000
    );
  });
});

describe("a fixture the athlete entered", () => {
  /**
   * The programme's calendar is fixed at fifty-two weeks and guesses, by
   * phase, which days hold a game. `nonCompetitionSaturdaySession` says so in
   * its own description: "No league game is assumed in this calendar block."
   * An entered fixture is not an assumption, so where the two disagree the
   * fixture wins.
   */
  const hasGame = (session: { tasks: { stageTitle: string }[] }) =>
    session.tasks.some((task) => task.stageTitle === "Compete");

  /** The first week the phase table plans with no game in it. */
  const noGameWeek = (() => {
    for (let week = 1; week <= 52; week += 1) {
      const plan = weekPlan(week);
      if (["transition", "transition_summer", "preseason", "summer_break"].includes(String(plan.phase.id))) {
        return week;
      }
    }
    throw new Error("no off-season week in the phase table");
  })();

  it("turns a planned rest Saturday into a game day", () => {
    const plan = weekPlan(noGameWeek);
    expect(hasGame(buildSession(plan, 5))).toBe(false);
    expect(hasGame(buildSession(plan, 5, { game: true }))).toBe(true);
  });

  it("puts the game day on a Friday when that is where the game is", () => {
    // The programme writes exactly one game-day session and it is Saturday's.
    // A finals series runs Friday and Saturday, so it is rebuilt for the day
    // rather than invented a second time.
    const plan = weekPlan(noGameWeek);
    const friday = buildSession(plan, 4, { game: true });
    expect(hasGame(friday)).toBe(true);
    expect(friday.title).toMatch(/^Friday · Game Day/);
  });

  it("re-keys the ids, so Friday's ticks are not filed against Saturday", () => {
    // Two games in one week is exactly when this matters: a Friday session
    // carrying `-d5-` ids would share every completion, set log and skip with
    // the Saturday beside it.
    const plan = weekPlan(noGameWeek);
    const friday = buildSession(plan, 4, { game: true });
    const saturday = buildSession(plan, 5, { game: true });
    expect(friday.tasks.every((task) => !/-d5-/.test(task.id))).toBe(true);
    expect(friday.tasks.some((task) => /-d4-/.test(task.id))).toBe(true);
    const shared = friday.tasks
      .map((task) => task.id)
      .filter((id) => saturday.tasks.some((task) => task.id === id));
    expect(shared).toEqual([]);
  });

  it("leaves a day the programme already planned as a game exactly as it was", () => {
    // Nothing here adds a second game to a game day, or changes one.
    for (let week = 1; week <= 52; week += 1) {
      const plan = weekPlan(week);
      for (let day = 0; day < 7; day += 1) {
        const planned = buildSession(plan, day);
        if (!hasGame(planned)) continue;
        expect(buildSession(plan, day, { game: true }), `week ${week} day ${day}`).toEqual(planned);
      }
    }
  });

  it("changes nothing at all on a day with no fixture", () => {
    // An empty fixture list means nobody has told the app about that week yet,
    // not that the week is empty — so the absence of a game never takes one
    // away.
    for (let week = 1; week <= 52; week += 1) {
      const plan = weekPlan(week);
      for (let day = 0; day < 7; day += 1) {
        expect(buildSession(plan, day, { game: false }), `week ${week} day ${day}`).toEqual(
          buildSession(plan, day)
        );
      }
    }
  });

  it("still yields recovery-only work on a red readiness reading", () => {
    // A game on the calendar does not outrank a health signal.
    const plan = weekPlan(noGameWeek);
    expect(hasGame(buildSession(plan, 5, { game: true, risk: "red" }))).toBe(false);
  });

  it("produces a game day with the throwing the day actually needs", () => {
    const plan = weekPlan(noGameWeek);
    const friday = buildSession(plan, 4, { game: true });
    const names = friday.tasks.map((task) => task.name);
    expect(names).toContain("Pregame bullpen");
    expect(names).toContain("Game appearance");
    expect(friday.description).toMatch(/a fixture was entered for it/);
  });
});

describe("a week's fixtures reaching the intensity policy", () => {
  /**
   * The day-level flag decides whether a day is a game day. This is the week
   * level: whether the plyo ladder on the Wednesday *before* a final is still
   * capped at the recovery band because the block table planned an off-season
   * unload there.
   *
   * The count travels on the session rather than through a fourth argument to
   * `applyBaselineProgramming`, for the reason that function's own comment
   * gives about its eighty call sites — and so it cannot be forgotten.
   */
  it("stamps the count on the session it builds", () => {
    const plan = weekPlan(9);
    expect(buildSession(plan, 2, { weekGames: 2 }).gamesThisWeek).toBe(2);
    expect(buildSession(plan, 2).gamesThisWeek).toBeUndefined();
  });

  it("stamps it on a recovery-only session too", () => {
    // A red readiness reading replaces the session, and the week is still the
    // week it was.
    expect(buildSession(weekPlan(9), 2, { weekGames: 2, risk: "red" }).gamesThisWeek).toBe(2);
  });

  const plyos = (week: number, day: number, games?: number) =>
    applyBaselineProgramming(
      buildSession(weekPlan(week), day, games === undefined ? {} : { weekGames: games }),
      null,
      day
    )
      .tasks.filter((task) => task.stageTitle === "Plyo Ball Preparation")
      .map((task) => task.prescription);

  it("lifts the unload's intent cap on the days around a final", () => {
    // Tuesday of week 9. The programme writes this ladder at 70%, and the
    // restore block's recovery ceiling pulls it down to 50–60%; with a finals
    // weekend entered it goes back to hybrid B — the ceiling the season itself
    // ran at, and no higher.
    expect(plyos(9, 1).length).toBeGreaterThan(0);
    expect(plyos(9, 1).every((dose) => /recovery intent/.test(dose))).toBe(true);
    expect(plyos(9, 1, 2).filter((dose) => /hybrid B intent/.test(dose)).length).toBeGreaterThan(0);
  });

  it("raises nothing the programme itself wrote low", () => {
    // The ceiling is a cap, never a promotion. Tuesday's 1,000 g reverse throw
    // is written at 50–60% because it is the heaviest ball, and it stays there
    // whatever the week is allowed to reach — the same rule `applyToPlyos`
    // already follows for a develop week.
    const heaviest = (games?: number) => plyos(9, 1, games)[0];
    expect(heaviest()).toMatch(/50–60%/);
    expect(heaviest(2)).toBe(heaviest());
  });

  it("leaves the transition Wednesday alone, pulldowns included", () => {
    // The one day it would be wrong to un-suppress. A two-game week assigns no
    // separate velocity day — the hard throwing comes out of the games — so
    // the Wednesday that already has no pulldowns is the right Wednesday, and
    // its ladder is written low by the programme rather than capped by the
    // block.
    const wednesday = (games?: number) =>
      applyBaselineProgramming(
        buildSession(weekPlan(9), 2, games === undefined ? {} : { weekGames: games }),
        null,
        2
      ).tasks;
    // The work itself, not the whole task: the policy's own note travels on
    // `evidence`, and it should say which policy is in force.
    const work = (tasks: ReturnType<typeof wednesday>) =>
      tasks.map((task) => `${task.name} :: ${task.prescription}`);
    expect(work(wednesday(2))).toEqual(work(wednesday()));
    expect(wednesday(2).some((task) => /pulldown/i.test(task.name))).toBe(false);
  });

  it("adds no volume doing it", () => {
    // A taper cuts volume and holds intensity (Bosquet 2007). This lifts the
    // intensity cap and must not touch anything else — same tasks, in the same
    // order, at the same sets and reps.
    for (const day of [1, 4]) {
      const capped = applyBaselineProgramming(buildSession(weekPlan(9), day), null, day).tasks;
      const restored = applyBaselineProgramming(
        buildSession(weekPlan(9), day, { weekGames: 2 }),
        null,
        day
      ).tasks;
      expect(restored.map((task) => task.id), `day ${day}`).toEqual(capped.map((task) => task.id));
      const shape = (text: string) => (String(text).match(/\d+\s*×\s*\d+/) ?? [""])[0];
      expect(restored.map((task) => shape(task.prescription)), `day ${day}`).toEqual(
        capped.map((task) => shape(task.prescription))
      );
    }
  });

  it("leaves an in-season week alone, whatever its fixtures", () => {
    // Only a restore week is overridden — every other block either already
    // expects competition or is a build the athlete is in the middle of.
    for (const week of [3, 15, 26]) {
      const plan = weekPlan(week);
      for (let day = 0; day < 7; day += 1) {
        expect(
          applyBaselineProgramming(buildSession(plan, day, { weekGames: 2 }), null, day).tasks,
          `week ${week} day ${day}`
        ).toEqual(applyBaselineProgramming(buildSession(plan, day), null, day).tasks);
      }
    }
  });
});
