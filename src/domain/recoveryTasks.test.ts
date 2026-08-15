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
import { LoggedOuting, recoveryForDay } from "./recoveryProtocol";

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

  it("adds the day's blocks as real tasks", () => {
    expect(merged.added).toBeGreaterThan(0);
    const names = merged.session.tasks.map((task) => task.name);
    expect(names).toContain("Compression sleeve, throwing arm");
    expect(names).toContain("Feed inside 60 minutes");
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
    expect(stageOf("mobility-cooldown")).toBe("Arm Care");
  });

  it("leaves the systemic work in Recover", () => {
    const stageOf = (id: string) =>
      merged.session.tasks.find((task) => String(task.id).endsWith(`-recovery-${id}`))?.stageTitle;
    expect(stageOf("feed")).toBe("Recover");
    expect(stageOf("sleep")).toBe("Recover");
    expect(stageOf("walkdown")).toBe("Recover");
    expect(stageOf("heat")).toBe("Recover");
  });

  it("splits day 2 the same way", () => {
    const day2 = recoveryForDay("2026-08-16" as never, [heavyOuting("2026-08-14")]);
    const two = applyRecoveryProtocol(session(), day2);
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

  it("still adds the band routine, which is real work", () => {
    expect(merged.session.tasks.map((task) => task.name)).toContain("Full arm-care band routine");
  });
});

describe("the day-2 dip", () => {
  it("is carried into the note so it is not read as a problem", () => {
    const recovery = recoveryForDay("2026-08-16" as never, [heavyOuting("2026-08-14")]);
    const merged = applyRecoveryProtocol(session(), recovery);
    expect(merged.note).toMatch(/expected/i);
  });
});
