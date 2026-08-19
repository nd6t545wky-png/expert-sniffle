/**
 * Recovery inside the daily plan.
 *
 * The protocol earns its place by being part of the day rather than a page the
 * athlete has to remember to open. These tests hold the two properties that
 * makes true: the day's blocks arrive as real tasks in the right stages, and
 * the two blocks that describe the shape of the day never become a second
 * bullpen on a day that already has one.
 */

import { describe, expect, it } from "vitest";
import { buildSession, setProgrammeContext, weekPlan } from "./programmeSessions";
import { applyRecoveryProtocol } from "./recoveryTasks";
import { LoggedOuting, buildGymRecoveryPlan, gymSessionForDay, recoveryForDay } from "./recoveryProtocol";

const PBS = { trainingMaxes: { lifts: { squat: { value: 140, kind: "kg" } } } };
setProgrammeContext({ pbs: PBS });

const plan = weekPlan(5, PBS);
const session = () => buildSession(plan, 0);

const heavyOuting = (date: string): LoggedOuting => ({
  date: date as never,
  load: { gamePitches: 78, competitiveStart: true },
});

describe("reading the day from the log", () => {
  it("finds day 0 on the day of the outing", () => {
    const found = recoveryForDay("2026-08-14" as never, [heavyOuting("2026-08-14")]);
    expect(found?.dayOffset).toBe(0);
    expect(found?.tier).toBe("heavy");
  });

  it("counts forward through the protocol", () => {
    const outings = [heavyOuting("2026-08-14")];
    expect(recoveryForDay("2026-08-16" as never, outings)?.dayOffset).toBe(2);
    expect(recoveryForDay("2026-08-18" as never, outings)?.dayOffset).toBe(4);
  });

  it("stops when the protocol runs out", () => {
    expect(recoveryForDay("2026-08-19" as never, [heavyOuting("2026-08-14")])).toBeNull();
  });

  it("stops sooner for a lighter outing", () => {
    const light: LoggedOuting = { date: "2026-08-14" as never, load: { totalThrows: 34, intentPercent: 60 } };
    // A 34-throw session at 60% triggers on volume but is a light day: two days.
    expect(recoveryForDay("2026-08-15" as never, [light])?.dayOffset).toBe(1);
    expect(recoveryForDay("2026-08-16" as never, [light])).toBeNull();
  });

  it("ignores a session that never triggered", () => {
    const easy: LoggedOuting = { date: "2026-08-14" as never, load: { totalThrows: 12, intentPercent: 50 } };
    expect(recoveryForDay("2026-08-14" as never, [easy])).toBeNull();
  });

  it("resets to the most recent outing rather than the heaviest", () => {
    // Throwing again is a new thing to recover from. A Saturday start must not
    // keep prescribing day-4 work through Wednesday's bullpen.
    const outings = [heavyOuting("2026-08-14"), { date: "2026-08-17" as never, load: { totalThrows: 40, intentPercent: 100 } }];
    const found = recoveryForDay("2026-08-18" as never, outings);
    expect(found?.outingDate).toBe("2026-08-17");
    expect(found?.dayOffset).toBe(1);
  });

  it("returns nothing when nothing was logged", () => {
    expect(recoveryForDay("2026-08-14" as never, [])).toBeNull();
  });
});

describe("merging into the session", () => {
  const recovery = recoveryForDay("2026-08-14" as never, [heavyOuting("2026-08-14")], 85);
  const merged = applyRecoveryProtocol(session(), recovery);

  it("adds the blocks the programme has no task for", () => {
    expect(merged.added).toBeGreaterThan(0);
    const names = merged.session.tasks.map((task) => task.name);
    expect(names).toContain("Compression sleeve, throwing arm");
    expect(names).toContain("Percussive massage, throwing shoulder");
  });

  it("folds the rest into the programme tasks that already cover them", () => {
    // Feeding and sleep are not added as new tasks: the day already ends with
    // "Post-session fuel and fluids" and "Recovery plan", so the protocol
    // takes those over instead of sitting beside them.
    const names = merged.session.tasks.map((task) => task.name);
    expect(names).not.toContain("Feed inside 60 minutes");
    expect(names).toContain("Post-session fuel and fluids");
  });

  it("puts them in the Arm Care and Recover stages, not the middle of the throwing", () => {
    const recoveryTasks = merged.session.tasks.filter((task) => String(task.id).includes("-recovery-"));
    expect(recoveryTasks.length).toBeGreaterThan(0);
    for (const task of recoveryTasks) {
      expect(["Arm Care", "Recover"], task.name).toContain(task.stageTitle);
    }
  });

  it("puts what is done to the throwing arm in Arm Care", () => {
    const stageOf = (id: string) =>
      merged.session.tasks.find((task) => String(task.id).endsWith(`-recovery-${id}`))?.stageTitle;
    // The sleeve goes on the throwing arm and the massage on the throwing
    // shoulder, so neither is general recovery.
    expect(stageOf("compression")).toBe("Arm Care");
    expect(stageOf("percussive")).toBe("Arm Care");
    // The cool-down takes over the programme's own Arm Care circuit rather
    // than being added, so it is already in the right stage.
    expect(merged.session.tasks.find((task) => task.name === "Post-throw arm-care circuit")?.stageTitle).toBe(
      "Arm Care"
    );
  });

  it("leaves the systemic work in Recover", () => {
    const stageOf = (id: string) =>
      merged.session.tasks.find((task) => String(task.id).endsWith(`-recovery-${id}`))?.stageTitle;
    expect(stageOf("heat")).toBe("Recover");
    // Feeding, sleep and the walk-down fold into the programme's own Recover
    // tasks, which are already in this stage.
    for (const name of ["Post-session fuel and fluids", "Recovery plan"]) {
      expect(merged.session.tasks.find((task) => task.name === name)?.stageTitle).toBe("Recover");
    }
  });

  it("splits day 2 the same way", () => {
    const day2 = recoveryForDay("2026-08-16" as never, [heavyOuting("2026-08-14")]);
    // The stretch is held while throwing is still to come, so resolve the
    // day's throwing first — otherwise this asserts the hold, not the split.
    const base = session();
    const thrown = base.tasks
      .filter((task) =>
        ["Throw", "High-Intent Prep", "Game Warm-up", "Team Throwing", "Compete", "Speed"].includes(
          task.stageTitle
        )
      )
      .map((task) => task.id);
    const two = applyRecoveryProtocol(base, day2, { resolvedTaskIds: thrown });
    const stageOf = (id: string) =>
      two.session.tasks.find((task) => String(task.id).endsWith(`-recovery-${id}`))?.stageTitle;
    expect(stageOf("sleeper-stretch")).toBe("Arm Care");
    expect(stageOf("compression-overnight")).toBe("Arm Care");
    expect(stageOf("soft-tissue")).toBe("Recover");
  });

  it("keeps the session's own tasks and their order", () => {
    const before = session().tasks.map((task) => task.id);
    const after = merged.session.tasks.map((task) => task.id).filter((id) => !String(id).includes("-recovery-"));
    expect(after).toEqual(before);
  });

  it("carries the reason onto each task, so it is not the first thing skipped", () => {
    const compression = merged.session.tasks.find((task) => String(task.id).endsWith("-recovery-compression"));
    expect(String(compression?.cue)).toMatch(/strength recovery/i);
  });

  it("carries a caveat where the block has one", () => {
    const percussive = merged.session.tasks.find((task) => String(task.id).endsWith("-recovery-percussive"));
    expect(String(percussive?.stop)).toMatch(/worse than ice at 48 h/i);
  });

  it("never adds a block twice", () => {
    const twice = applyRecoveryProtocol(merged.session, recovery);
    expect(twice.added).toBe(0);
    expect(twice.session.tasks).toHaveLength(merged.session.tasks.length);
  });

  it("gives every task a unique id", () => {
    const ids = merged.session.tasks.map((task) => task.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("says which day of which outing this is", () => {
    expect(merged.note).toContain("Day 0");
    expect(merged.note).toContain("heavy");
    expect(merged.note).toContain("2026-08-14");
  });

  it("changes nothing when there is no recovery to apply", () => {
    const untouched = applyRecoveryProtocol(session(), null);
    expect(untouched.added).toBe(0);
    expect(untouched.note).toBeNull();
    expect(untouched.session.tasks).toEqual(session().tasks);
  });
});

describe("the day the programme already has throwing", () => {
  const recovery = recoveryForDay("2026-08-17" as never, [heavyOuting("2026-08-14")]);
  const merged = applyRecoveryProtocol(session(), recovery);

  it("is day 3, the re-load", () => {
    expect(recovery?.dayOffset).toBe(3);
  });

  it("does not add a second bullpen as a task", () => {
    const names = merged.session.tasks.map((task) => task.name);
    expect(names).not.toContain("Light catch-play or touch-and-feel bullpen");
  });

  it("says it in the note instead", () => {
    expect(merged.note).toMatch(/catch-play|touch-and-feel/i);
  });

  it("gives the band work back the programme's own circuit slot", () => {
    // Day 3 is where the band routine belongs, so it takes over the
    // programme's arm-care circuit rather than adding a second one.
    const circuit = merged.session.tasks.find((task) => task.name === "Post-throw arm-care circuit");
    expect(circuit?.prescription).toMatch(/11-exercise/);
  });
});

describe("the day-2 dip", () => {
  it("is carried into the note so it is not read as a problem", () => {
    const recovery = recoveryForDay("2026-08-16" as never, [heavyOuting("2026-08-14")]);
    const merged = applyRecoveryProtocol(session(), recovery);
    expect(merged.note).toMatch(/expected/i);
  });
});

describe("no work appears twice", () => {
  const day0 = recoveryForDay("2026-08-14" as never, [heavyOuting("2026-08-14")], 85);
  const merged = applyRecoveryProtocol(session(), day0);
  const names = merged.session.tasks.map((task) => task.name);

  it("leaves no duplicate task names anywhere in the day", () => {
    expect(new Set(names).size, names.join(" | ")).toBe(names.length);
  });

  it("does not add a second protein task beside the programme's", () => {
    expect(names.filter((name) => /fuel and fluids|Feed inside/i.test(name))).toHaveLength(1);
  });

  it("does not add a second sleep or down-regulation task", () => {
    expect(names.filter((name) => /Recovery plan|Sleep target|Walk-down/i.test(name))).toHaveLength(1);
  });

  it("does not add a second cuff circuit", () => {
    expect(names.filter((name) => /arm-care circuit|band routine|Mobility cool-down/i.test(name))).toHaveLength(1);
  });

  it("folds the protocol's prescription into the task it took over", () => {
    const fuel = merged.session.tasks.find((task) => task.name === "Post-session fuel and fluids");
    expect(fuel?.prescription).toBe("26–34 g protein plus carbohydrate");
  });

  it("joins two blocks that land on one task rather than dropping either", () => {
    // "Recovery plan" is down-regulation and sleep; both must survive.
    const plan = merged.session.tasks.find((task) => task.name === "Recovery plan");
    expect(plan?.prescription).toMatch(/5 min/);
    expect(plan?.prescription).toMatch(/9 h in bed/);
  });

  it("replaces the loaded T+0 circuit with the mobility cool-down", () => {
    // The protocol moves band work off day 0 deliberately, so the programme's
    // own circuit must not still be prescribing it there.
    const circuit = merged.session.tasks.find((task) => task.name === "Post-throw arm-care circuit");
    expect(circuit?.prescription).toMatch(/shoulder CARs/);
    expect(circuit?.prescription).not.toMatch(/band row/);
  });

  it("gives the band work back its slot on day 3", () => {
    const day3 = recoveryForDay("2026-08-17" as never, [heavyOuting("2026-08-14")]);
    const three = applyRecoveryProtocol(session(), day3);
    const circuit = three.session.tasks.find((task) => task.name === "Post-throw arm-care circuit");
    expect(circuit?.prescription).toMatch(/11-exercise/);
    const threeNames = three.session.tasks.map((task) => task.name);
    expect(new Set(threeNames).size).toBe(threeNames.length);
  });

  it("has no duplicates on any day of any tier", () => {
    for (const tier of ["light", "moderate", "heavy"] as const) {
      const load = tier === "heavy" ? { gamePitches: 78, competitiveStart: true }
        : tier === "moderate" ? { gamePitches: 45 }
        : { totalThrows: 34, intentPercent: 60 };
      for (let offset = 0; offset < 5; offset += 1) {
        const date = ["2026-08-14", "2026-08-15", "2026-08-16", "2026-08-17", "2026-08-18"][offset];
        const found = recoveryForDay(date as never, [{ date: "2026-08-14" as never, load }]);
        if (!found) continue;
        for (let day = 0; day < 7; day += 1) {
          const out = applyRecoveryProtocol(buildSession(plan, day), found);
          const taskNames = out.session.tasks.map((task) => task.name);
          expect(new Set(taskNames).size, `${tier} day ${offset} weekday ${day}: ${taskNames.join(" | ")}`).toBe(
            taskNames.length
          );
          const ids = out.session.tasks.map((task) => task.id);
          expect(new Set(ids).size).toBe(ids.length);
        }
      }
    }
  });
});

describe("the gym track", () => {
  const gymDay = (offset: number) => ({
    plan: buildGymRecoveryPlan({ sessionType: "max_strength", sessionDate: "2026-08-14" as never, bodyweightKg: 85 }),
    dayOffset: offset,
  });

  it("is read from the plan the athlete actually did, not asked for", () => {
    const s = session();
    const gymTask = s.tasks.find((task) => /Whole-Body|Microdose/.test(task.stageTitle));
    // Nothing resolved yet: a prescribed session that was not trained is not
    // something to recover from.
    expect(gymSessionForDay(s.tasks, [])).toBeNull();
    if (gymTask) {
      expect(gymSessionForDay(s.tasks, [gymTask.id])).not.toBeNull();
    }
  });

  it("adds its blocks to the day on its own", () => {
    const merged = applyRecoveryProtocol(session(), null, { gym: gymDay(0) });
    expect(merged.added).toBeGreaterThan(0);
    const names = merged.session.tasks.map((task) => task.name);
    expect(names).toContain("Compression on the trained limbs");
    expect(merged.note).toMatch(/max strength/i);
  });

  it("does not double the protein or the compression when both tracks run", () => {
    const throwing = recoveryForDay("2026-08-14" as never, [heavyOuting("2026-08-14")], 85);
    const merged = applyRecoveryProtocol(session(), throwing, { gym: gymDay(0) });
    const names = merged.session.tasks.map((task) => task.name);

    // The protocol's own rules: protein is per day, one garment period covers
    // both. So the gym's versions are dropped, not added beside the throwing
    // day's.
    expect(names.filter((n) => /protein|fuel and fluids/i.test(n))).toHaveLength(1);
    // One sleeve for the arm and one boots session for the legs — different
    // body parts, so two tasks is right and three would not be.
    expect(names.filter((n) => /compression sleeve/i.test(n))).toHaveLength(1);
    expect(names.filter((n) => /compression boots/i.test(n))).toHaveLength(1);
    expect(names.filter((n) => /compression/i.test(n))).toHaveLength(2);
    expect(new Set(names).size).toBe(names.length);
  });

  it("says which order to train in when both land on one day", () => {
    const throwing = recoveryForDay("2026-08-14" as never, [heavyOuting("2026-08-14")], 85);
    const merged = applyRecoveryProtocol(session(), throwing, { gym: gymDay(0) });
    expect(merged.note).toMatch(/throw first, lift second/i);
  });

  it("carries the no-cold rule wherever recovery appears", () => {
    const merged = applyRecoveryProtocol(session(), null, { gym: gymDay(0) });
    expect(merged.note).toMatch(/no ice/i);
  });

  it("changes nothing when neither track applies", () => {
    const untouched = applyRecoveryProtocol(session(), null, { gym: null });
    expect(untouched.added).toBe(0);
    expect(untouched.note).toBeNull();
  });
});

describe("holding work that would cost strength before throwing", () => {
  const day2 = recoveryForDay("2026-08-16" as never, [heavyOuting("2026-08-14")], 85);

  it("holds the sleeper stretch while throwing is still to come", () => {
    // Nothing resolved: the day's throwing has not happened yet.
    const merged = applyRecoveryProtocol(session(), day2, { resolvedTaskIds: [] });
    expect(merged.session.tasks.map((task) => task.name)).not.toContain(
      "Sleeper and/or cross-body stretch"
    );
  });

  it("prescribes it once the throwing is done", () => {
    const s = session();
    const throwing = s.tasks
      .filter((task) => ["Throw", "High-Intent Prep", "Game Warm-up", "Team Throwing", "Compete", "Speed"].includes(task.stageTitle))
      .map((task) => task.id);
    const merged = applyRecoveryProtocol(s, day2, { resolvedTaskIds: throwing });
    expect(merged.session.tasks.map((task) => task.name)).toContain(
      "Sleeper and/or cross-body stretch"
    );
  });

  it("does not hold the scraper, whose evidence shows no strength cost", () => {
    const merged = applyRecoveryProtocol(session(), day2, { resolvedTaskIds: [] });
    expect(merged.session.tasks.map((task) => task.name)).toContain(
      "Scraper, posterior shoulder and lat"
    );
  });

  it("carries the evidence onto the task so a dose can be traced", () => {
    const merged = applyRecoveryProtocol(session(), day2, { resolvedTaskIds: [] });
    const scraper = merged.session.tasks.find((task) => String(task.id).endsWith("-recovery-scraper"));
    expect(String(scraper?.evidence)).toMatch(/IASTM meta-analysis/);
    expect(String(scraper?.evidence)).toMatch(/4\.94°/);
  });
});
