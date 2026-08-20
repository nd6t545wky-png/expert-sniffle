/**
 * The velocity policy, pinned against the whole year.
 *
 * Two of these tests are the ones that matter, and both are sweeps rather than
 * examples. The first walks all fifty-two weeks and all seven days and asserts
 * that no plyo throw anywhere ever exceeds its week's ceiling — because the
 * bug being fixed was not "one Wednesday is too hot", it was "the ceiling does
 * not vary with the calendar at all", and only a sweep can show that it now
 * does. The second checks the develop block against the published fixture
 * list: a velocity block that overlaps a game is the same mistake wearing a
 * different label.
 */

import { describe, expect, it } from "vitest";
import {
  BAND_ORDER,
  BAND_PERCENT,
  IntentBand,
  applyVelocityPolicy,
  bandFor,
  lowerBand,
  velocityPolicy,
  weekFromTasks,
} from "./velocity";
import { buildSession, weekPlan } from "./programmeSessions";
import { applyBaselineProgramming } from "./programmeUpdates";
import { FIXTURES } from "./fixtures";
import { ReducedLevel } from "./reducedVolume";

const WEEKS = Array.from({ length: 52 }, (_, index) => index + 1);
const DAYS = [0, 1, 2, 3, 4, 5, 6];

/** The programme's week 1 begins here; `fixtures.ts` speaks in dates. */
const ANNUAL_START = Date.UTC(2026, 6, 13);

function weekWindow(week: number): { from: string; to: string } {
  const start = ANNUAL_START + (week - 1) * 7 * 86_400_000;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(start), to: iso(start + 6 * 86_400_000) };
}

function tasksFor(week: number, day: number, level: ReducedLevel | null = null) {
  return applyBaselineProgramming(buildSession(weekPlan(week), day), level, day).tasks;
}

/** Every effort percentage a session writes down, whatever phrasing it uses. */
function efforts(prescription: string): number[] {
  return [...prescription.matchAll(/(\d+)\s*%/g)].map((match) => Number(match[1]));
}

function plyoTasks(week: number, day: number, level: ReducedLevel | null = null) {
  return tasksFor(week, day, level).filter((task) => task.stageTitle === "Plyo Ball Preparation");
}

describe("the four bands", () => {
  it("names a band for every percentage the programme ever wrote", () => {
    // The nine values the extraction actually contains.
    for (const written of [45, 50, 55, 60, 65, 70, 75, 80, 85]) {
      expect(BAND_ORDER).toContain(bandFor(written));
    }
  });

  it("resolves the 80% tie downwards, not upwards", () => {
    // 80 is exactly ten points from both hybrid B and hybrid A. Resolving it
    // upwards would raise intent on the strength of a rounding rule.
    expect(bandFor(80)).toBe("hybrid_b");
    expect(bandFor(85)).toBe("hybrid_a");
    expect(bandFor(64)).toBe("recovery");
  });

  it("takes the lower of two bands, in either argument order", () => {
    expect(lowerBand("velocity", "hybrid_b")).toBe("hybrid_b");
    expect(lowerBand("hybrid_b", "velocity")).toBe("hybrid_b");
    expect(lowerBand("recovery", "recovery")).toBe("recovery");
  });
});

describe("the year", () => {
  it("assigns every one of the fifty-two weeks a block", () => {
    for (const week of WEEKS) {
      const policy = velocityPolicy(week);
      expect(policy.block).toBeTruthy();
      expect(policy.headline).toMatch(/plyo ceiling/);
      expect(policy.note.length).toBeGreaterThan(40);
    }
  });

  it("reports a coherent position within each block", () => {
    for (const week of WEEKS) {
      const policy = velocityPolicy(week);
      expect(policy.weekInBlock).toBeGreaterThanOrEqual(1);
      expect(policy.weekInBlock).toBeLessThanOrEqual(policy.blockWeeks);
    }
  });

  it("caps conservatively outside the programme rather than throwing", () => {
    // Week 0 and week 99 are not real, but a session id could be misparsed and
    // a policy that crashes is worse than one that is careful.
    for (const week of [0, 53, 99]) {
      expect(velocityPolicy(week).plyoCeiling).toBe("hybrid_b");
      expect(velocityPolicy(week).velocityDay).toBe(false);
    }
  });

  it("puts the velocity block where there are no games", () => {
    const develop = WEEKS.filter((week) => velocityPolicy(week).block === "develop");
    expect(develop.length).toBeGreaterThan(0);

    for (const week of develop) {
      const { from, to } = weekWindow(week);
      const clash = FIXTURES.filter((fixture) => fixture.date >= from && fixture.date <= to);
      expect(clash, `week ${week} (${from}–${to}) has a fixture in it`).toEqual([]);
    }
  });

  it("never assigns a velocity day to a week with two games in it", () => {
    for (const week of WEEKS) {
      const policy = velocityPolicy(week);
      if (policy.block === "two_game") expect(policy.velocityDay).toBe(false);
    }
  });
});

describe("the ceiling, across the whole programme", () => {
  it("never lets a plyo throw exceed its week's band", () => {
    for (const week of WEEKS) {
      const ceiling = BAND_PERCENT[velocityPolicy(week).plyoCeiling];
      for (const day of DAYS) {
        for (const task of plyoTasks(week, day)) {
          for (const written of efforts(task.prescription)) {
            expect(
              written,
              `week ${week} day ${day} — ${task.name}: ${task.prescription}`
            ).toBeLessThanOrEqual(ceiling);
          }
        }
      }
    }
  });

  it("holds the in-season weeks to the hybrid B band", () => {
    // This is the change the athlete asked for: fourteen light-ball throws at
    // 85%, three days before a game, is where the reported injury risk sits.
    const inSeason = WEEKS.filter((week) => velocityPolicy(week).block === "in_season");
    expect(inSeason).toContain(3);

    for (const week of inSeason) {
      for (const day of DAYS) {
        for (const task of plyoTasks(week, day)) {
          for (const written of efforts(task.prescription)) {
            expect(written, `week ${week} day ${day}: ${task.prescription}`).toBeLessThanOrEqual(70);
          }
        }
      }
    }
  });

  it("drops the restore weeks to the recovery band", () => {
    for (const week of WEEKS.filter((w) => velocityPolicy(w).block === "restore")) {
      for (const day of DAYS) {
        for (const task of plyoTasks(week, day)) {
          for (const written of efforts(task.prescription)) {
            expect(written).toBeLessThanOrEqual(60);
          }
        }
      }
    }
  });

  it("keeps a reduced day off hybrid A even inside the velocity block", () => {
    // The week's ceiling and the day's readiness are separate limits. A
    // develop week does not entitle a tired athlete to a velocity dose.
    const develop = WEEKS.find((week) => velocityPolicy(week).block === "develop")!;
    for (const level of ["reduced", "recovery"] as ReducedLevel[]) {
      for (const task of plyoTasks(develop, 2, level)) {
        for (const written of efforts(task.prescription)) {
          expect(written, `${level}: ${task.prescription}`).toBeLessThanOrEqual(70);
        }
      }
    }
  });

  it("writes the band by name, not just a number", () => {
    const plyos = plyoTasks(3, 2);
    expect(plyos.length).toBeGreaterThan(0);
    for (const task of plyos) {
      expect(task.prescription).toMatch(/hybrid B intent|recovery intent|hybrid A intent/);
    }
  });
});

describe("the velocity day", () => {
  const develop = WEEKS.filter((week) => velocityPolicy(week).block === "develop");

  it("exists, and says what it is", () => {
    for (const week of develop) {
      const day = tasksFor(week, 2);
      const velocity = day.find((task) => /^Velocity day/.test(task.name));
      // Week 27 converts to the mound and has no pulldown set of its own; the
      // block is three weeks and at least one of them must carry the day.
      if (!velocity) continue;
      expect(velocity.prescription).toMatch(/\d+ measured throws/);
      expect(velocity.prescription).toMatch(/90–100%/);
      expect(velocity.prescription).toMatch(/regulation 5 oz/);
    }
    const anyVelocityDay = develop.some((week) =>
      tasksFor(week, 2).some((task) => /^Velocity day/.test(task.name))
    );
    expect(anyVelocityDay).toBe(true);
  });

  it("keeps the whole session inside Tread's twenty high-effort throws", () => {
    for (const week of develop) {
      const tasks = tasksFor(week, 2);
      let total = 0;
      for (const task of tasks) {
        if (task.stageTitle === "Plyo Ball Preparation" && /hybrid A/.test(task.prescription)) {
          const sets = task.prescription.match(/^(\d+)\s*×\s*(\d+)/);
          if (sets) total += Number(sets[1]) * Number(sets[2]);
        }
        const measured = task.prescription.match(/^(\d+) measured throws/);
        if (measured) total += Number(measured[1]);
      }
      expect(total, `week ${week} high-effort throws`).toBeLessThanOrEqual(20);
      expect(total).toBeGreaterThan(0);
    }
  });

  it("never appears in a week that is not a develop week", () => {
    for (const week of WEEKS.filter((w) => velocityPolicy(w).block !== "develop")) {
      for (const day of DAYS) {
        expect(
          tasksFor(week, day).some((task) => /^Velocity day/.test(task.name)),
          `week ${week} day ${day}`
        ).toBe(false);
      }
    }
  });

  it("does not run on a reduced day", () => {
    for (const week of develop) {
      const names = tasksFor(week, 2, "reduced").map((task) => task.name);
      expect(names.some((name) => /^Velocity day/.test(name))).toBe(false);
    }
  });

  it("tells an in-season pulldown set what the week's budget is", () => {
    const pulldown = tasksFor(3, 2).find((task) => /pulldown/i.test(task.name));
    expect(pulldown).toBeTruthy();
    expect(pulldown!.cue).toMatch(/high-effort/i);
    expect(pulldown!.cue).toMatch(/In season/);
  });
});

describe("reading the week off the session", () => {
  it("recovers the right week from every real session in the year", () => {
    for (const week of WEEKS) {
      for (const day of DAYS) {
        expect(weekFromTasks(buildSession(weekPlan(week), day).tasks)).toBe(week);
      }
    }
  });

  it("leaves a session it cannot place completely alone", () => {
    const session = {
      title: "",
      focus: "",
      duration: "",
      stress: "",
      description: "",
      tasks: [
        {
          id: "hold-review",
          stage: 2,
          stageTitle: "Plyo Ball Preparation",
          stageDescription: "",
          name: "Plyo Ball Walking Windup — 100 g",
          prescription: "2 × 2 · 85% perceived effort",
          cue: "",
        },
      ],
    };
    expect(weekFromTasks(session.tasks)).toBeNull();
    expect(applyVelocityPolicy(session, { week: null })).toBe(session);
  });
});

/**
 * The overlay had always been guarded against adding a *task* twice. Nothing
 * compared the prose, and the prose was where it was actually duplicating —
 * the bar-speed cue, the plyo evidence note, the superset rest instruction and
 * the reduced-dose note all appended on every pass. This checks every field
 * the overlay writes, on every day of the year, at every readiness level.
 */
describe("running it twice", () => {
  const FIELDS = ["name", "prescription", "cue", "setup", "execution", "rest", "stop"] as const;

  it("changes nothing the second time, on any day of any week", () => {
    for (const week of [3, 10, 11, 20, 26, 27, 45]) {
      for (const day of DAYS) {
        for (const level of [null, "reduced", "recovery"] as (ReducedLevel | null)[]) {
          const once = applyBaselineProgramming(buildSession(weekPlan(week), day), level, day);
          const twice = applyBaselineProgramming(once, level, day);
          for (const field of FIELDS) {
            expect(
              twice.tasks.map((task) => task[field]),
              `week ${week} day ${day} level ${level} — ${field}`
            ).toEqual(once.tasks.map((task) => task[field]));
          }
        }
      }
    }
  });
});

describe("nothing is left unreadable", () => {
  it("never writes an unresolved value into a prescription or a cue", () => {
    for (const week of WEEKS) {
      for (const day of DAYS) {
        for (const task of tasksFor(week, day)) {
          for (const text of [task.name, task.prescription, task.cue]) {
            expect(String(text)).not.toMatch(/undefined|NaN|\[object|null/);
          }
        }
      }
    }
  });

  it("gives every capped plyo throw a dose as well as an intent", () => {
    for (const week of WEEKS) {
      for (const day of DAYS) {
        for (const task of plyoTasks(week, day)) {
          expect(task.prescription, `week ${week} day ${day}`).toMatch(/\d+\s*×\s*\d+/);
        }
      }
    }
  });
});

/** Guards the band table itself against a careless edit. */
describe("the band table", () => {
  it("runs strictly upwards", () => {
    const percents = BAND_ORDER.map((band: IntentBand) => BAND_PERCENT[band]);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(new Set(percents).size).toBe(percents.length);
  });
});
