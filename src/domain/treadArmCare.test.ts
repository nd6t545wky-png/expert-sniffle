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
  scapSessionFor,
} from "./treadArmCare";
import { buildThrowingRecoveryPlan } from "./recoveryProtocol";

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

describe("choosing a session", () => {
  it("alternates, so both halves of the programme run", () => {
    const picks = ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27"].map(
      (date) => scapSessionFor(date).id
    );
    expect(new Set(picks).size).toBe(2);
    expect(picks[0]).not.toBe(picks[1]);
    expect(picks[0]).toBe(picks[2]);
  });

  it("is stable, so re-opening a past day shows what was prescribed then", () => {
    expect(scapSessionFor("2026-08-24").id).toBe(scapSessionFor("2026-08-24").id);
  });

  it("survives a date it cannot read rather than throwing", () => {
    expect(SCAP_SESSIONS.map((s) => s.id)).toContain(scapSessionFor("not-a-date" as never).id);
  });
});

describe("on the plan", () => {
  const plan = (outingDate: string) =>
    buildThrowingRecoveryPlan({ tier: "heavy", outingDate: outingDate as never, bodyweightKg: 85 });

  it("puts a named scapular session on day 1", () => {
    const day1 = plan("2026-08-24").days[1];
    const block = day1.blocks.find((b) => b.id === "scap-strength")!;
    expect(block.prescription).toMatch(/\d+ rounds:/);
    expect(block.name).toMatch(/Scapular strengthening — /);
    // The prescription names the session too, because this block takes over a
    // programme task on the plan and inherits that task's name.
    expect(block.prescription).toMatch(/^(Scapular, serratus and grip|Posterior chain and serratus) — /);
  });

  it("puts the coach's mobility programme on day 2", () => {
    const day2 = plan("2026-08-24").days[2];
    const block = day2.blocks.find((b) => b.id === "soft-tissue")!;
    expect(block.name).toBe("Recovery and mobility programme");
    expect(block.prescription).toContain("Thoracic Spine Windmills 15 reps each direction");
  });

  it("gives two different outings the two different sessions", () => {
    const a = plan("2026-08-24").days[1].blocks.find((b) => b.id === "scap-strength")!.prescription;
    const b = plan("2026-08-25").days[1].blocks.find((b) => b.id === "scap-strength")!.prescription;
    expect(a).not.toBe(b);
  });

  it("does not put the same movement in two blocks on one day", () => {
    // The whole reason these replaced the generic blocks rather than joining
    // them: one scapular circuit per day, not two.
    for (const date of ["2026-08-24", "2026-08-25"]) {
      for (const day of plan(date).days) {
        const named = day.blocks.flatMap((block) =>
          [...MOBILITY_PROGRAM, ...SCAP_SESSIONS.flatMap((s) => [...s.opener, ...s.supersets.flatMap((ss) => ss.exercises)])]
            .filter((exercise) => block.prescription.includes(exercise.name))
            .map((exercise) => exercise.name)
        );
        expect(new Set(named).size, `${date} ${day.title}`).toBe(named.length);
      }
    }
  });
});
