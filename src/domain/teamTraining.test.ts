/**
 * Club training nights.
 *
 * The failure this exists to prevent is additive, so that is what most of
 * these check: a Tuesday that carries both the solo command set *and* a club
 * practice is a hundred-throw day inside a plan that thinks it prescribed
 * fifty. The mirror failure matters just as much — the summer weeks were
 * written around practice already, and folding a second one into them would
 * be the same bug wearing the opposite sign.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEAM_TRAINING,
  TeamTraining,
  applyTeamTraining,
  isTrainingNight,
  readTeamTraining,
} from "./teamTraining";
import { buildSession, dateForWeekDay, weekPlan } from "./programmeSessions";
import { applyBaselineProgramming } from "./programmeUpdates";

const TUESDAY = 1;
const WEDNESDAY = 2;

function day(week: number, index: number) {
  const plan = weekPlan(week);
  const date = dateForWeekDay(plan, index);
  const session = applyBaselineProgramming(buildSession(plan, index), null, index);
  return { session, date };
}

function fold(week: number, index: number, settings: TeamTraining = DEFAULT_TEAM_TRAINING) {
  const { session, date } = day(week, index);
  return { before: session, ...applyTeamTraining(session, { day: index, date, settings }), date };
}

const names = (session: { tasks: { name: unknown }[] }) => session.tasks.map((task) => String(task.name));

describe("reading the setting", () => {
  it("defaults to what is true now — Tuesdays, from the week they started", () => {
    expect(readTeamTraining(undefined)).toEqual(DEFAULT_TEAM_TRAINING);
    expect(DEFAULT_TEAM_TRAINING.days).toEqual([TUESDAY]);
  });

  it("keeps a saved choice", () => {
    expect(readTeamTraining({ days: [1, 3], from: "2026-09-01", club: "Norths" })).toEqual({
      days: [1, 3],
      from: "2026-09-01",
      club: "Norths",
    });
  });

  it("refuses nonsense rather than letting it reach the plan", () => {
    const settings = readTeamTraining({ days: ["x", 9, -1, 2, 2], from: "not-a-date", club: "   " });
    expect(settings.days).toEqual([2]);
    expect(settings.from).toBe(DEFAULT_TEAM_TRAINING.from);
    expect(settings.club).toBe(DEFAULT_TEAM_TRAINING.club);
  });

  it("treats an empty day list as no training, not as the default", () => {
    // Turning every night off has to mean something, or the setting is a lie.
    expect(readTeamTraining({ days: [] }).days).toEqual([]);
  });
});

describe("which nights count", () => {
  const settings = DEFAULT_TEAM_TRAINING;

  it("starts on the date it started, not before", () => {
    expect(isTrainingNight(settings, TUESDAY, "2026-08-25" as never)).toBe(true);
    expect(isTrainingNight(settings, TUESDAY, "2026-08-18" as never)).toBe(false);
  });

  it("is only the chosen weekdays", () => {
    for (const index of [0, 2, 3, 4, 5, 6]) {
      expect(isTrainingNight(settings, index, "2026-09-01" as never)).toBe(false);
    }
  });

  it("says no when there is no day to speak of", () => {
    expect(isTrainingNight(settings, null, "2026-09-01" as never)).toBe(false);
  });
});

describe("a winter Tuesday, now that training is on", () => {
  const tuesday = fold(7, TUESDAY);

  it("replaces the solo command set instead of adding to it", () => {
    expect(names(tuesday.before)).toContain("Flat-ground command");
    expect(names(tuesday.session)).not.toContain("Flat-ground command");
    expect(names(tuesday.session)).toContain("Coomera Cubs practice throwing");
  });

  it("never leaves two throwing sets on the day", () => {
    const throwing = tuesday.session.tasks.filter((task) =>
      /throws/i.test(String(task.prescription))
    );
    expect(throwing).toHaveLength(1);
    expect(String(throwing[0].prescription)).toBe("40–60 throws · distance and intensity set by team plan");
  });

  it("adds the practice itself, so the workload gets counted", () => {
    expect(names(tuesday.session)).toContain("Complete Coomera Cubs training");
    const practice = tuesday.session.tasks.find((task) => task.stageTitle === "Team Practice")!;
    expect(String(practice.prescription)).toMatch(/record session duration and RPE/);
  });

  it("keeps the speed work but takes a rep off it", () => {
    const before = tuesday.before.tasks.find((task) => /Acceleration quality/.test(String(task.name)))!;
    const after = tuesday.session.tasks.find((task) => /Acceleration quality/.test(String(task.name)))!;
    expect(String(before.prescription)).toMatch(/3 × 20 m/);
    expect(String(after.prescription)).toMatch(/2 × 20 m/);
    expect(String(after.cue)).toMatch(/running of its own/);
  });

  it("keeps the warm-up, plyos and arm care untouched", () => {
    for (const name of ["Wrist and forearm prep", "Hip prep — rotation and glutes", "Post-throw arm-care circuit"]) {
      expect(names(tuesday.session)).toContain(name);
    }
    expect(tuesday.session.tasks.filter((t) => t.stageTitle === "Plyo Ball Preparation").length).toBeGreaterThan(0);
  });

  it("renames the day, because the old name described the work it removed", () => {
    expect(String(tuesday.before.title)).toBe("Tuesday · Command + Acceleration");
    expect(String(tuesday.session.title)).toBe("Tuesday · Club training + Acceleration");
  });

  it("says on the day what it did, and why", () => {
    expect(tuesday.note).toMatch(/Coomera Cubs training tonight/);
    expect(tuesday.note).toMatch(/replaced by practice throwing, not added to it/);
  });

  it("puts the practice where the throwing was, so the day still reads in order", () => {
    const stages = tuesday.session.tasks.map((task) => Number(task.stage));
    expect([...stages]).toEqual([...stages].sort((a, b) => a - b));
    const titles = tuesday.session.tasks.map((task) => String(task.stageTitle));
    expect(titles.indexOf("Team Throwing")).toBeGreaterThan(titles.indexOf("Prepare"));
    expect(titles.indexOf("Team Throwing")).toBeLessThan(titles.indexOf("Arm Care"));
  });
});

describe("the days it must not touch", () => {
  it("leaves a Tuesday before training started exactly as written", () => {
    const before = fold(6, TUESDAY);
    expect(before.note).toBeNull();
    expect(names(before.session)).toContain("Flat-ground command");
    expect(before.session).toBe(before.before);
  });

  it("leaves a summer Tuesday alone, because it already has practice on it", () => {
    // The mirror failure: folding a second practice into a week written around
    // one would double the day just as surely.
    const summer = fold(15, TUESDAY);
    expect(summer.note).toBeNull();
    expect(names(summer.session).filter((name) => /practice throwing/i.test(name))).toHaveLength(1);
    expect(summer.session.tasks.filter((task) => task.stageTitle === "Team Practice")).toHaveLength(1);
  });

  it("leaves every other day of the training week alone", () => {
    for (const index of [0, 3, 4, 5, 6]) {
      const other = fold(7, index);
      expect(other.session.tasks.filter((task) => task.stageTitle === "Team Practice")).toHaveLength(0);
    }
  });
});

describe("the day after", () => {
  it("warns the velocity day that it follows a practice", () => {
    const wednesday = fold(7, WEDNESDAY);
    const pulldowns = wednesday.session.tasks.find((task) => /pulldown/i.test(String(task.name)))!;
    expect(String(pulldowns.cue)).toMatch(/trained last night/);
    expect(String(pulldowns.cue)).toMatch(/cut rather than push through/);
    expect(wednesday.note).toMatch(/Follows Coomera Cubs training/);
  });

  it("does not warn a Wednesday before training started", () => {
    const wednesday = fold(6, WEDNESDAY);
    const pulldowns = wednesday.session.tasks.find((task) => /pulldown/i.test(String(task.name)))!;
    expect(String(pulldowns.cue)).not.toMatch(/trained last night/);
  });

  it("says it once, however many times it runs", () => {
    const { session, date } = day(7, WEDNESDAY);
    const once = applyTeamTraining(session, { day: WEDNESDAY, date, settings: DEFAULT_TEAM_TRAINING });
    const twice = applyTeamTraining(once.session, { day: WEDNESDAY, date, settings: DEFAULT_TEAM_TRAINING });
    expect(twice.session.tasks.map((task) => task.cue)).toEqual(once.session.tasks.map((task) => task.cue));
  });
});

describe("running it twice", () => {
  it("changes nothing the second time", () => {
    const { session, date } = day(7, TUESDAY);
    const once = applyTeamTraining(session, { day: TUESDAY, date, settings: DEFAULT_TEAM_TRAINING });
    const twice = applyTeamTraining(once.session, { day: TUESDAY, date, settings: DEFAULT_TEAM_TRAINING });
    for (const field of ["name", "prescription", "cue", "stage", "stageTitle"] as const) {
      expect(twice.session.tasks.map((task) => task[field])).toEqual(
        once.session.tasks.map((task) => task[field])
      );
    }
  });
});

describe("across the whole year", () => {
  const settings = DEFAULT_TEAM_TRAINING;

  it("never produces a day with two throwing blocks on it", () => {
    for (let week = 1; week <= 52; week += 1) {
      for (let index = 0; index < 7; index += 1) {
        const { session } = fold(week, index, settings);
        const blocks = session.tasks.filter((task) =>
          ["Throw", "Team Throwing"].includes(String(task.stageTitle))
        );
        // Wednesday legitimately has a build-up and a measured set; what must
        // never happen is a solo block sitting beside a practice block.
        const titles = new Set(blocks.map((task) => String(task.stageTitle)));
        expect(titles.size, `week ${week} day ${index}: ${[...titles].join(" + ")}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("never leaves a task without a name or a prescription", () => {
    for (let week = 1; week <= 52; week += 1) {
      for (let index = 0; index < 7; index += 1) {
        for (const task of fold(week, index, settings).session.tasks) {
          expect(String(task.name).trim()).not.toBe("");
          expect(String(task.prescription).trim()).not.toBe("");
          expect(`${task.name} ${task.prescription} ${task.cue}`).not.toMatch(/undefined|NaN/);
        }
      }
    }
  });

  it("keeps every session's stages in order", () => {
    for (let week = 1; week <= 52; week += 1) {
      for (let index = 0; index < 7; index += 1) {
        const stages = fold(week, index, settings).session.tasks.map((task) => Number(task.stage));
        expect(stages, `week ${week} day ${index}`).toEqual([...stages].sort((a, b) => a - b));
      }
    }
  });

  it("does nothing at all when the athlete turns the nights off", () => {
    const off: TeamTraining = { ...DEFAULT_TEAM_TRAINING, days: [] };
    for (let week = 1; week <= 52; week += 1) {
      for (let index = 0; index < 7; index += 1) {
        const { before, session, note } = fold(week, index, off);
        expect(session).toBe(before);
        expect(note).toBeNull();
      }
    }
  });
});
