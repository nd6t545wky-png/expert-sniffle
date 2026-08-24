/**
 * "What did I lift last time, and should today be heavier."
 *
 * The test that carries the most weight here is the one asserting the app
 * never tells the athlete to add plates to a percentage-driven lift. Adding
 * 2.5 kg to the back squat because last Monday felt easy is not progression —
 * it is opting out of the block, and it is exactly what a naive
 * "did-you-hit-your-reps" rule would say every single week.
 */

import { describe, expect, it } from "vitest";
import {
  daysBetween,
  liftHistory,
  prescribedShape,
  progressionFor,
  workingLoad,
  worstReps,
} from "./progression";
import { buildSession, weekPlan } from "./programmeSessions";
import { applyBaselineProgramming } from "./programmeUpdates";
import { isLoggable } from "./setLog";

const TODAY = "2026-08-24";

const perf = (date: string, sets: [number, number][]) => ({
  date: date as never,
  sets: sets.map(([reps, kg]) => ({ reps, kg })),
});

describe("reading a prescription", () => {
  it("finds the shape of a self-selected lift", () => {
    expect(prescribedShape("3 × 5 @ RPE 7 · suggested start 50–52.5 kg")).toMatchObject({
      sets: 3,
      reps: 5,
      kg: 50,
      fixedLoad: false,
    });
  });

  it("marks a percentage-driven lift as the block's, not the athlete's", () => {
    expect(prescribedShape("3 × 4 @ 120 kg · 83% of tested max")).toMatchObject({
      sets: 3,
      reps: 4,
      kg: 120,
      fixedLoad: true,
    });
  });

  it("treats a bare measured load as fixed too", () => {
    // The speed squat is 94 kg because that is the measured optimal power
    // load, not because it is a starting suggestion.
    expect(prescribedShape("4 × 3 @ 94 kg · every rep maximal intent")?.fixedLoad).toBe(true);
  });

  it("treats a load offered alongside an RPE as a starting point", () => {
    expect(prescribedShape("3 × 5/leg @ RPE 7 · 24–28 kg dumbbells as tolerated")).toMatchObject({
      kg: 24,
      fixedLoad: false,
      perSide: true,
    });
  });

  it("notices bodyweight work", () => {
    expect(prescribedShape("2 × 5 · bodyweight · 2–3 reps in reserve")?.bodyweight).toBe(true);
  });

  it("returns nothing for a prescription with no set-and-rep shape", () => {
    expect(prescribedShape("5 minutes easy bike, jog or brisk walk")).toBeNull();
    expect(prescribedShape("")).toBeNull();
  });
});

describe("finding the last time", () => {
  const logs = {
    "2026-08-10": { "w5-d0-back-squat": [{ reps: 5, kg: 110 }] },
    "2026-08-17": { "w6-d0-back-squat": [{ reps: 5, kg: 115 }] },
    "2026-08-24": { "w7-d0-back-squat": [{ reps: 4, kg: 120 }] },
  };
  const names = {
    "w5-d0-back-squat": "Back squat",
    "w6-d0-back-squat": "Back squat",
    "w7-d0-back-squat": "Back squat",
  };

  it("matches on the lift's name, because ids carry the week", () => {
    const history = liftHistory(logs, names, "Back squat", TODAY);
    expect(history).toHaveLength(2);
    expect(history[0].date).toBe("2026-08-17");
  });

  it("never counts today or later as history", () => {
    expect(liftHistory(logs, names, "Back squat", "2026-08-11")).toHaveLength(1);
    expect(liftHistory(logs, names, "Back squat", "2026-08-10")).toEqual([]);
  });

  it("ignores lifts it cannot name", () => {
    expect(liftHistory(logs, {}, "Back squat", TODAY)).toEqual([]);
  });

  it("reports the working load and the worst set", () => {
    const sets = [
      { reps: 5, kg: 100 },
      { reps: 5, kg: 110 },
      { reps: 3, kg: 115 },
    ];
    expect(workingLoad(sets)).toBe(100);
    // The reps that decide whether the load was too much — on straight sets
    // the "heaviest set" is just the first one, which hides a fade.
    expect(worstReps(sets)).toBe(3);
    expect(worstReps([{ reps: 5, kg: 70 }, { reps: 3, kg: 70 }, { reps: 2, kg: 70 }])).toBe(2);
  });

  it("counts days between sessions", () => {
    expect(daysBetween("2026-08-17", "2026-08-24")).toBe(7);
    expect(daysBetween("2026-08-23", "2026-08-24")).toBe(1);
  });
});

describe("a lift whose load the block owns", () => {
  const squat = { name: "Back squat", prescription: "3 × 4 @ 120 kg · 83% of tested max" };

  it("compares, and never tells you to add plates", () => {
    const advice = progressionFor(squat, [perf("2026-08-17", [[5, 115], [5, 115], [5, 115]])], TODAY)!;
    expect(advice.verdict).toBe("follow_plan");
    expect(advice.suggestedKg).toBe(120);
    expect(advice.headline).toMatch(/115 kg → 120 kg/);
    expect(advice.reason).toMatch(/retest/);
  });

  it("says so when the block takes the load down", () => {
    const advice = progressionFor(squat, [perf("2026-08-17", [[4, 125], [4, 125]])], TODAY)!;
    expect(advice.headline).toMatch(/Lighter than last time by 5 kg/);
    expect(advice.headline).toMatch(/that is the block, not a mistake/);
  });

  it("never returns an increase verdict, whatever the history", () => {
    // The rule a naive implementation would get wrong: three perfect sessions
    // in a row still does not license adding weight to a percentage.
    for (const sets of [
      [[8, 120], [8, 120], [8, 120]],
      [[4, 120], [4, 120], [4, 120]],
      [[1, 200]],
    ] as [number, number][][]) {
      const advice = progressionFor(squat, [perf("2026-08-17", sets)], TODAY)!;
      expect(advice.verdict).toBe("follow_plan");
      expect(advice.suggestedKg).toBe(120);
    }
  });
});

describe("a lift you choose the load for", () => {
  const bench = { name: "Bench press", prescription: "3 × 5 @ RPE 7 · suggested start 50–52.5 kg" };

  it("goes up when every set hit the target", () => {
    const advice = progressionFor(bench, [perf("2026-08-17", [[5, 60], [5, 60], [5, 60]])], TODAY)!;
    expect(advice.verdict).toBe("increase");
    expect(advice.suggestedKg).toBe(62.5);
    expect(advice.headline).toBe("Go up to 62.5 kg.");
  });

  it("holds when a set fell short", () => {
    const advice = progressionFor(bench, [perf("2026-08-17", [[5, 60], [5, 60], [4, 60]])], TODAY)!;
    expect(advice.verdict).toBe("repeat");
    expect(advice.suggestedKg).toBe(60);
    expect(advice.reason).toMatch(/1 set was short/);
  });

  it("holds when the sets were not all done", () => {
    const advice = progressionFor(bench, [perf("2026-08-17", [[5, 60], [5, 60]])], TODAY)!;
    expect(advice.verdict).toBe("repeat");
    expect(advice.reason).toMatch(/2 of 3 sets/);
  });

  it("takes weight off when the top set collapsed", () => {
    const advice = progressionFor(bench, [perf("2026-08-17", [[5, 70], [3, 70], [2, 70]])], TODAY)!;
    expect(advice.verdict).toBe("back_off");
    expect(advice.suggestedKg).toBe(62.5);
    expect(advice.reason).toMatch(/10%/);
    expect(advice.reason).toMatch(/2 reps against 5/);
  });

  it("uses a dumbbell-sized jump for dumbbell work", () => {
    const advice = progressionFor(
      { name: "Rear-foot-elevated split squat", prescription: "3 × 5/leg @ RPE 7 · 24–28 kg dumbbells as tolerated" },
      [perf("2026-08-17", [[5, 24], [5, 24], [5, 24]])],
      TODAY
    )!;
    expect(advice.verdict).toBe("increase");
    expect(advice.suggestedKg).toBe(26);
    expect(advice.headline).toMatch(/per hand/);
  });

  it("progresses bodyweight work by reps, not by load", () => {
    const advice = progressionFor(
      { name: "Chin-up", prescription: "2 × 5 · bodyweight · 2–3 reps in reserve" },
      [perf("2026-08-17", [[5, 0], [5, 0]])],
      TODAY
    )!;
    expect(advice.verdict).toBe("increase");
    expect(advice.headline).toMatch(/Add a rep/);
    expect(advice.suggestedKg).toBeUndefined();
  });

  it("says how long ago, in words that mean something", () => {
    expect(progressionFor(bench, [perf("2026-08-23", [[5, 60], [5, 60], [5, 60]])], TODAY)!.reason).toMatch(
      /yesterday/
    );
    expect(progressionFor(bench, [perf("2026-08-17", [[5, 60], [5, 60], [5, 60]])], TODAY)!.reason).toMatch(
      /7 days ago/
    );
  });
});

describe("the first time", () => {
  it("says so, and points at the plan's load where there is one", () => {
    const advice = progressionFor(
      { name: "Back squat", prescription: "3 × 4 @ 120 kg · 83% of tested max" },
      [],
      TODAY
    )!;
    expect(advice.verdict).toBe("first_time");
    expect(advice.headline).toMatch(/120 kg/);
    expect(advice.last).toBeUndefined();
  });

  it("asks for a load where the plan does not name one", () => {
    const advice = progressionFor({ name: "Chin-up", prescription: "2 × 5 · bodyweight" }, [], TODAY)!;
    expect(advice.verdict).toBe("first_time");
    expect(advice.headline).toMatch(/pick a load and log it/);
  });
});

describe("against the real programme", () => {
  it("gives advice for every loggable task in the year, and never crashes", () => {
    for (let week = 1; week <= 52; week += 1) {
      const plan = weekPlan(week);
      for (let day = 0; day < 7; day += 1) {
        for (const task of applyBaselineProgramming(buildSession(plan, day), null, day).tasks) {
          if (!isLoggable(task)) continue;
          const advice = progressionFor(task, [], "2026-08-24" as never);
          expect(advice, `${task.id}: ${task.prescription}`).toBeTruthy();
          expect(advice!.headline.trim()).not.toBe("");
          expect(advice!.headline).not.toMatch(/undefined|NaN/);
        }
      }
    }
  });

  it("never tells the athlete to add weight to a block-driven lift, anywhere in the year", () => {
    const history = [perf("2026-08-17", [[10, 200], [10, 200], [10, 200], [10, 200]])];
    for (let week = 1; week <= 52; week += 1) {
      const plan = weekPlan(week);
      for (let day = 0; day < 7; day += 1) {
        for (const task of applyBaselineProgramming(buildSession(plan, day), null, day).tasks) {
          if (!isLoggable(task)) continue;
          const shape = prescribedShape(String(task.prescription));
          if (!shape?.fixedLoad) continue;
          const advice = progressionFor(task, history, "2026-08-24" as never)!;
          expect(advice.verdict, `${task.id}: ${task.name}`).toBe("follow_plan");
          expect(advice.suggestedKg, `${task.id}`).toBe(shape.kg);
        }
      }
    }
  });

  it("does offer progression on the accessories, or the feature is pointless", () => {
    const tasks = applyBaselineProgramming(buildSession(weekPlan(7), 0), null, 0).tasks;
    const selfSelected = tasks.filter(
      (task) => isLoggable(task) && prescribedShape(String(task.prescription))?.fixedLoad === false
    );
    expect(selfSelected.length).toBeGreaterThan(0);
    for (const task of selfSelected) {
      const shape = prescribedShape(String(task.prescription))!;
      const cleared = Array.from({ length: shape.sets }, () => [shape.reps, 40] as [number, number]);
      const advice = progressionFor(task, [perf("2026-08-17", cleared)], TODAY)!;
      expect(["increase"], `${task.name}: ${advice.verdict}`).toContain(advice.verdict);
    }
  });
});
