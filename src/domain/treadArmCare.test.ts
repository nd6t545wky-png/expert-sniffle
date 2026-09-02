/**
 * The coach's arm-care programme.
 *
 * This module is a transcription, so most of what is worth testing is whether
 * it still says what the source said. The doses are the coach's; a typo here
 * is not a rounding error, it is the athlete doing different work. The rest is
 * about the property that made this worth doing at all: every line names an
 * exercise and gives it a number, and neither session appears twice on a day.
 */

import { describe, expect, it } from "vitest";
import {
  MOBILITY_PROGRAM,
  SCAP_SESSIONS,
  describeMobility,
  describeSession,
  movementCount,
  armCareForDay,
  MOBILITY_SESSION,
} from "./treadArmCare";
import { buildSession, weekPlan } from "./programmeSessions";
import { applyBaselineProgramming } from "./programmeUpdates";

describe("the transcription", () => {
  it("keeps both scapular sessions", () => {
    expect(SCAP_SESSIONS).toHaveLength(2);
    expect(SCAP_SESSIONS.map((session) => session.id)).toEqual(["tread-scap-a", "tread-scap-b"]);
  });

  it("carries session A exactly as the programme wrote it", () => {
    const [a] = SCAP_SESSIONS;
    expect(a.capturedOn).toBe("2025-01-29");
    expect(a.minutes).toBe(27);
    expect(a.opener.map((e) => `${e.name} ${e.dose}`)).toEqual([
      "Split Stance Flexion Ball Drops 50–75 reps",
      "Tripod T Dribbles 20 seconds",
    ]);
    expect(a.supersets.map((s) => s.sets)).toEqual([2, 2, 3]);
    expect(a.supersets[0].exercises.map((e) => e.name)).toEqual([
      "Scap Lifts Off Wall",
      "90/90 to Y Scap Wall Slides",
      "Pivot Pick (low/mid trap recruitment)",
    ]);
    expect(a.supersets[2].exercises[0].dose).toBe("45–60 seconds");
  });

  it("carries session B exactly as the programme wrote it", () => {
    const b = SCAP_SESSIONS[1];
    expect(b.capturedOn).toBe("2025-01-17");
    expect(b.supersets.map((s) => s.sets)).toEqual([3, 3]);
    expect(b.supersets[1].exercises.map((e) => e.name)).toEqual([
      "Single Arm Serratus Slides",
      "Tripod Rotations with oscillations, weighted ball",
      "SA Split Stance Serratus Scoops",
    ]);
  });

  it("keeps the coach's number for the wall angels, not the day's logged reps", () => {
    // The programme says 20; the session was logged 12/10/10. What the athlete
    // managed once is not the prescription.
    const angels = SCAP_SESSIONS[1].supersets[0].exercises[0];
    expect(angels.name).toBe("Posterior Wall Angels");
    expect(angels.dose).toBe("20");
  });

  it("keeps all nine mobility items, in order", () => {
    expect(MOBILITY_PROGRAM).toHaveLength(9);
    expect(MOBILITY_PROGRAM[0].name).toContain("T-Spine Levered Extension");
    expect(MOBILITY_PROGRAM[8].name).toContain("Foam Roll Levered 90/90");
  });

  it("gives every movement a dose, everywhere", () => {
    const all = [...MOBILITY_PROGRAM, ...SCAP_SESSIONS.flatMap((s) => [...s.opener, ...s.supersets.flatMap((ss) => ss.exercises)])];
    for (const exercise of all) {
      expect(exercise.name.length, exercise.name).toBeGreaterThan(3);
      // "max reps" is one of the coach's own doses, and is a real instruction —
      // it is a number or an explicit effort target, never a bare adjective.
      expect(exercise.dose, exercise.name).toMatch(/\d|max reps/);
    }
  });

  it("never names the same movement twice inside one session", () => {
    for (const session of SCAP_SESSIONS) {
      const names = [...session.opener, ...session.supersets.flatMap((s) => s.exercises)].map((e) => e.name);
      expect(new Set(names).size, session.id).toBe(names.length);
    }
  });
});

describe("writing it out", () => {
  it("puts the round count in front of each superset", () => {
    const text = describeSession(SCAP_SESSIONS[0]);
    expect(text).toContain("2 rounds:");
    expect(text).toContain("3 rounds:");
    expect(text).toContain("Split Stance Flexion Ball Drops 50–75 reps");
  });

  it("writes a session with no opener without a stray separator", () => {
    const text = describeSession(SCAP_SESSIONS[1]);
    expect(text.startsWith("3 rounds:")).toBe(true);
    expect(text).not.toMatch(/^\s*—/);
  });

  it("counts the movements it is about to list", () => {
    expect(movementCount(SCAP_SESSIONS[0])).toBe(9);
    expect(movementCount(SCAP_SESSIONS[1])).toBe(5);
  });

  it("writes the mobility programme as named items with doses", () => {
    const text = describeMobility();
    expect(text).toContain("Pec Minor Release with active external rotation 2 minutes");
    expect(text).toContain("Levator Scap Elongation 3 seconds each direction");
  });
});

describe("which day gets which session", () => {
  it("puts each session on the weekday it was captured on", () => {
    // 29 Jan 2025 was a Wednesday, 13 Feb a Thursday, 17 Jan a Friday.
    expect(armCareForDay(2)!.id).toBe("tread-scap-a");
    expect(armCareForDay(3)!.id).toBe("tread-mobility");
    expect(armCareForDay(4)!.id).toBe("tread-scap-b");
  });

  it("agrees with the capture dates rather than restating them", () => {
    for (const [day, session] of [[2, armCareForDay(2)!], [3, armCareForDay(3)!], [4, armCareForDay(4)!]] as const) {
      const weekday = new Date(`${session.capturedOn}T00:00:00Z`).getUTCDay();
      // getUTCDay is Sunday-based; the app's day 0 is Monday.
      expect((weekday + 6) % 7, session.id).toBe(day);
    }
  });

  it("leaves the days the coach programmed nothing for alone", () => {
    for (const day of [0, 1, 5, 6]) expect(armCareForDay(day), `day ${day}`).toBeNull();
  });

  it("survives a day it cannot read rather than throwing", () => {
    for (const day of [null, -1, 9, 1.5]) expect(armCareForDay(day as number)).toBeNull();
  });
});

describe("on the plan", () => {
  const armCare = (week: number, day: number) =>
    applyBaselineProgramming(buildSession(weekPlan(week), day), null, day).tasks.filter(
      (task) => task.stageTitle === "Arm Care"
    );

  it("puts the scapular session on Wednesday", () => {
    const [task] = armCare(7, 2);
    expect(String(task.name)).toBe("Arm care — Scapular, serratus and grip");
    expect(String(task.prescription)).toContain("Split Stance Flexion Ball Drops 50–75 reps");
    expect(String(task.prescription)).toContain("2 rounds:");
  });

  it("puts the mobility programme on Thursday", () => {
    const [task] = armCare(7, 3);
    expect(String(task.name)).toBe("Arm care — Recovery and mobility");
    expect(String(task.prescription)).toContain("Levator Scap Elongation 3 seconds each direction");
  });

  it("puts the posterior session on Friday", () => {
    const [task] = armCare(7, 4);
    expect(String(task.name)).toBe("Arm care — Posterior chain and serratus");
    expect(String(task.prescription)).toContain("Posterior Wall Angels 20");
  });

  it("leaves Monday, Tuesday and Saturday as the programme wrote them", () => {
    for (const day of [0, 1, 5]) {
      const [task] = armCare(7, day);
      expect(String(task.name), `day ${day}`).toBe("Post-throw arm-care circuit");
    }
  });

  it("rewrites the existing task rather than adding a second circuit", () => {
    for (const day of [2, 3, 4]) {
      expect(armCare(7, day), `day ${day}`).toHaveLength(1);
    }
  });

  it("keeps the task id, so completion tracking survives the rewrite", () => {
    const before = buildSession(weekPlan(7), 2).tasks.find((t) => t.stageTitle === "Arm Care")!;
    const after = armCare(7, 2)[0];
    expect(after.id).toBe(before.id);
  });

  it("does the same in the summer block, where the week has a different shape", () => {
    expect(String(armCare(20, 2)[0].name)).toBe("Arm care — Scapular, serratus and grip");
    expect(String(armCare(20, 3)[0].name)).toBe("Arm care — Recovery and mobility");
  });

  it("never names the same movement twice on one day", () => {
    const every = [
      ...MOBILITY_PROGRAM,
      ...SCAP_SESSIONS.flatMap((s) => [...s.opener, ...s.supersets.flatMap((ss) => ss.exercises)]),
    ];
    for (let day = 0; day < 7; day += 1) {
      const text = applyBaselineProgramming(buildSession(weekPlan(7), day), null, day)
        .tasks.map((task) => `${task.name} ${task.prescription}`)
        .join(" | ");
      for (const exercise of every) {
        const hits = text.split(exercise.name).length - 1;
        expect(hits, `day ${day}: ${exercise.name}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("the mobility session", () => {
  it("is the nine items, as straight sets", () => {
    expect(MOBILITY_SESSION.opener).toHaveLength(9);
    expect(MOBILITY_SESSION.supersets).toHaveLength(0);
    expect(movementCount(MOBILITY_SESSION)).toBe(9);
  });
});
