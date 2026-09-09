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

  const wednesday = (games?: number) =>
    applyBaselineProgramming(
      buildSession(weekPlan(9), 2, games === undefined ? {} : { weekGames: games }),
      null,
      2
    ).tasks;

  it("leaves the transition Wednesday's throwing alone, pulldowns included", () => {
    // The one thing it would be wrong to un-suppress. A two-game week assigns
    // no separate velocity day — the hard throwing comes out of the games — so
    // the Wednesday that already has no pulldowns is the right Wednesday, and
    // its ladder is written low by the programme rather than capped by the
    // block.
    const throwing = (tasks: ReturnType<typeof wednesday>) =>
      tasks
        .filter((task) => /^(Throw|Plyo Ball Preparation)$/.test(String(task.stageTitle)))
        .map((task) => `${task.name} :: ${task.prescription}`);
    expect(throwing(wednesday(2))).toEqual(throwing(wednesday()));
    expect(wednesday(2).some((task) => /pulldown/i.test(task.name))).toBe(false);
  });

  const hinge = (tasks: ReturnType<typeof wednesday>) =>
    String(tasks.find((task) => /^Trap bar deadlift$/.test(String(task.name)))?.prescription);

  it("cuts the finals Wednesday's hinge volume and leaves the bar alone", () => {
    // The other half of the same taper. The rebuild block writes the hinge at
    // 3 × 5, which is the single heaviest item in the week and most of the
    // reason a week meant to taper carried more tonnage than the last
    // in-season week. Volume comes off; the percentage does not.
    expect(hinge(wednesday())).toMatch(/^3 × 5\b/);
    expect(hinge(wednesday(2))).toMatch(/^2 × 3\b/);

    // Everything after the sets and reps — the relative intensity, and the
    // load it resolves to — is identical. That is the whole distinction
    // between a taper and an unload, so it is asserted rather than assumed.
    const after = (dose: string) => dose.replace(/^\d+ × \d+/, "");
    expect(after(hinge(wednesday(2)))).toBe(after(hinge(wednesday())));
  });

  it("does not touch the hinge on an unload week with no game in it", () => {
    // Weeks 10, 37 and 38 are the genuine unload weeks — no fixture falls in
    // them, so no game count reaches them and the programme's own rebuild dose
    // stands. The gate is the fixture rather than the week number: a rebuild
    // Wednesday that *did* acquire a final would taper like week 9, which is
    // the point of reading the schedule instead of the phase table.
    for (const week of [10, 37, 38]) {
      const tasks = applyBaselineProgramming(buildSession(weekPlan(week), 2), null, 2).tasks;
      expect(hinge(tasks), `week ${week}`).toMatch(/^\d+ × \d+/);
      expect(hinge(tasks), `week ${week}`).not.toMatch(/^2 × 3\b/);
    }
  });

  it("only ever removes work from the hinge", () => {
    // A taper that adds sets is not a taper. Across every day of every week,
    // with a game entered, the prescribed rep total never rises.
    const reps = (dose: string) => {
      const shape = dose.match(/^(\d+) × (\d+)/);
      return shape ? Number(shape[1]) * Number(shape[2]) : null;
    };
    for (let week = 1; week <= 52; week += 1) {
      for (let day = 0; day < 7; day += 1) {
        const of = (games?: number) =>
          applyBaselineProgramming(
            buildSession(weekPlan(week), day, games === undefined ? {} : { weekGames: games }),
            null,
            day
          ).tasks;
        const plain = hinge(of());
        const gamed = hinge(of(2));
        if (plain === "undefined" || gamed === "undefined") continue;
        const before = reps(plain);
        const after = reps(gamed);
        if (before === null || after === null) continue;
        expect(after, `week ${week} day ${day}`).toBeLessThanOrEqual(before);
      }
    }
  });

  it("gives the transition Wednesday's gym its velocity work back", () => {
    // The gym is the half that *should* change. The rebuild block was written
    // for an athlete whose season had ended: it drops the speed squat and the
    // trap bar jump for moderate-rep strength, which leaves the finals week
    // cutting its lowest-volume, highest-velocity work and none of its
    // accumulation work. A taper is the other way round.
    const names = (tasks: ReturnType<typeof wednesday>) => tasks.map((task) => String(task.name));
    expect(names(wednesday())).not.toContain("Speed squat — optimal power load");
    expect(names(wednesday())).not.toContain("Trap bar jump");
    expect(names(wednesday(2))).toContain("Speed squat — optimal power load");
    expect(names(wednesday(2))).toContain("Trap bar jump");
  });

  it("leaves an unload Wednesday with no game in it exactly as it was", () => {
    // Weeks 10, 37 and 38 are genuine unload weeks. The rebuild block is right
    // for them and nothing here has a reason to touch it.
    for (const week of [10, 37, 38]) {
      const tasks = applyBaselineProgramming(buildSession(weekPlan(week), 2), null, 2).tasks;
      expect(tasks.some((task) => /Speed squat/.test(String(task.name))), `week ${week}`).toBe(false);
      expect(tasks.some((task) => /Trap bar jump/.test(String(task.name))), `week ${week}`).toBe(false);
    }
  });

  it("prices the restored jump from the same anchor as the programme's own", () => {
    // Two trap bar jumps now exist — one in the programme's content, one added
    // here — and a hardcoded load in either would drift from the other.
    const added = wednesday(2).find((task) => String(task.name) === "Trap bar jump");
    const inSeason = applyBaselineProgramming(buildSession(weekPlan(3), 2), null, 2).tasks.find(
      (task) => String(task.name) === "Trap bar jump"
    );
    expect(added?.prescription).toBe(inSeason?.prescription);
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

describe("the day before a game the athlete entered", () => {
  /**
   * The programme prepares for a game on the day before it — that is what
   * Friday's "Primer + Whole-Body Microdose" is, and its own description says
   * so: "before Saturday competition". It knew which day that was only for the
   * games its calendar assumed.
   *
   * On the semi-final weekend the game is Friday, so the day before it is
   * Thursday — which the phase table had planned as a post-season recovery day
   * carrying a Romanian deadlift at RPE 7, a calf raise at RPE 7–8 and three
   * sets of pogos, on a day whose own description reads "no ... lifting".
   */
  const noGameWeek = (() => {
    for (let week = 1; week <= 52; week += 1) {
      const plan = weekPlan(week);
      if (["transition", "transition_summer", "preseason", "summer_break"].includes(String(plan.phase.id))) {
        return week;
      }
    }
    throw new Error("no off-season week in the phase table");
  })();

  const isPrimer = (session: { tasks: { stageTitle: string }[] }) =>
    session.tasks.some((task) => task.stageTitle === "Whole-Body Primer");

  it("puts the programme's primer on the day before", () => {
    const plan = weekPlan(noGameWeek);
    expect(isPrimer(buildSession(plan, 3))).toBe(false);
    const eve = buildSession(plan, 3, { gameTomorrow: true });
    expect(isPrimer(eve)).toBe(true);
    expect(eve.title).toBe("Thursday · Primer + Whole-Body Microdose");
    expect(eve.description).toMatch(/day before a game/);
  });

  it("re-keys the ids, so the eve is not filed against the game", () => {
    const plan = weekPlan(noGameWeek);
    const eve = buildSession(plan, 3, { gameTomorrow: true });
    const game = buildSession(plan, 4, { game: true });
    expect(eve.tasks.every((task) => !/-d4-/.test(task.id))).toBe(true);
    expect(eve.tasks.some((task) => /-d3-/.test(task.id))).toBe(true);
    expect(eve.tasks.filter((task) => game.tasks.some((other) => other.id === task.id))).toEqual([]);
  });

  it("never demotes a game day to a primer", () => {
    // On a finals weekend Friday is both a game and the day before one.
    const plan = weekPlan(noGameWeek);
    const friday = buildSession(plan, 4, { game: true, gameTomorrow: true });
    expect(friday.tasks.some((task) => task.stageTitle === "Compete")).toBe(true);
    expect(friday.title).toMatch(/Game Day/);
  });

  it("leaves a day the programme already primes exactly as it was", () => {
    for (let week = 1; week <= 52; week += 1) {
      const plan = weekPlan(week);
      for (let day = 0; day < 7; day += 1) {
        const planned = buildSession(plan, day);
        if (!isPrimer(planned) && !planned.tasks.some((task) => task.stageTitle === "Compete")) continue;
        expect(buildSession(plan, day, { gameTomorrow: true }), `week ${week} day ${day}`).toEqual(planned);
      }
    }
  });

  it("changes nothing when no game is on the next day", () => {
    for (let week = 1; week <= 52; week += 1) {
      const plan = weekPlan(week);
      for (let day = 0; day < 7; day += 1) {
        expect(buildSession(plan, day, { gameTomorrow: false }), `week ${week} day ${day}`).toEqual(
          buildSession(plan, day)
        );
      }
    }
  });

  it("drops the Thursday microdoses that only made sense before a primer", () => {
    // `soleusTask` places them on Thursday "precisely because it is the light
    // one ... the day before a game block". When Thursday *is* the day before
    // the game, that position is gone — and what would land is a hinge at RPE
    // 7 and a calf raise at RPE 7–8, eighteen hours out.
    const plan = weekPlan(noGameWeek);
    const planned = applyBaselineProgramming(buildSession(plan, 3), null, 3).tasks;
    const eve = applyBaselineProgramming(buildSession(plan, 3, { gameTomorrow: true }), null, 3).tasks;

    const names = (tasks: typeof eve) => tasks.map((task) => String(task.name));
    expect(names(planned).some((name) => /Romanian deadlift — microdose/.test(name))).toBe(true);
    expect(names(planned).some((name) => /Seated calf raise — microdose/.test(name))).toBe(true);

    expect(names(eve).some((name) => /microdose/i.test(name))).toBe(false);
    expect(names(eve).some((name) => /Reactive microdose/.test(name))).toBe(false);
  });

  it("keeps the daily ankle priming on that day", () => {
    // The warm-up drops its ankle pogos on a Thursday because the reactive
    // dose supplies them. With that dose gone, dropping them too would leave
    // the pre-game day with no ankle priming at all.
    const plan = weekPlan(noGameWeek);
    const eve = applyBaselineProgramming(buildSession(plan, 3, { gameTomorrow: true }), null, 3).tasks;
    const pogos = eve.filter((task) => /Ankle stiffness pogos/.test(String(task.name)));
    expect(pogos).toHaveLength(1);
    expect(pogos[0].stageTitle).toBe("Prepare");
  });

  it("leaves the Thursday microdoses alone on an ordinary Thursday", () => {
    for (const week of [3, 15, 26]) {
      const tasks = applyBaselineProgramming(buildSession(weekPlan(week), 3), null, 3).tasks;
      expect(
        tasks.some((task) => /microdose/i.test(String(task.name))),
        `week ${week}`
      ).toBe(true);
    }
  });
});
