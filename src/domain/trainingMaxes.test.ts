/**
 * The maxes the plan multiplies by, and the arithmetic that recovered one.
 */

import { describe, expect, it } from "vitest";
import {
  MAXED_LIFTS,
  MAX_RANGE,
  isUsableMax,
  readTrainingMaxes,
  setTrainingMax,
} from "./trainingMaxes";
import { BASELINE_ANCHORS } from "./baseline";
import { buildSession, setProgrammeContext, weekPlan } from "./programmeSessions";
import { applyBaselineProgramming } from "./programmeUpdates";
import { seedBaselinePbs } from "./baseline";

describe("the trap bar max, solved from the programme's own tables", () => {
  /**
   * The programme carries the trap bar twice: a fifty-two-week table of
   * `sets × reps @ percent`, and the winter block's written loads. One is a
   * percentage of a max the app was never told; the other is that max already
   * multiplied out. So the max is solvable, and this is the check that it is
   * the number `BASELINE_ANCHORS` claims.
   */
  const SPECS: Record<number, [number, number, number]> = {
    1: [4, 5, 80], 2: [4, 5, 82], 3: [5, 3, 85], 4: [5, 3, 87],
    5: [6, 2, 80], 6: [6, 2, 82], 7: [6, 2, 83], 8: [4, 2, 77], 12: [3, 2, 70],
  };
  /** The written loads, for the weeks where the two tables agree on the shape. */
  const WRITTEN: Record<number, [number, number, number]> = {
    1: [4, 5, 120], 2: [4, 5, 122.5], 3: [5, 3, 127.5], 4: [5, 3, 130],
    5: [6, 2, 120], 6: [6, 2, 122.5], 7: [6, 2, 125], 8: [4, 2, 115], 12: [3, 2, 105],
  };
  const round = (value: number) => Math.round(value / 2.5) * 2.5;

  it("reproduces every written load at the derived max, and at no other", () => {
    const weeks = Object.keys(SPECS).map(Number);
    const hits = (max: number) =>
      weeks.filter((week) => round((max * SPECS[week][2]) / 100) === WRITTEN[week][2]).length;

    expect(hits(BASELINE_ANCHORS.trapBarDeadlift1RmKg)).toBe(weeks.length);
    // No neighbour works at all. This is what makes it a derivation rather
    // than a fit: one candidate explains every row and the others explain none.
    for (const near of [140, 142.5, 145, 147.5, 152.5, 155, 160]) {
      expect(hits(near), `${near} kg`).toBe(0);
    }
  });

  it("only compares weeks where the two tables agree on sets and reps", () => {
    // Three weeks disagree on shape as well as load; those rows describe
    // different weeks rather than a different max, and are left out above.
    for (const week of Object.keys(SPECS).map(Number)) {
      expect([SPECS[week][0], SPECS[week][1]], `week ${week}`).toEqual([
        WRITTEN[week][0],
        WRITTEN[week][1],
      ]);
    }
  });
});

describe("what the seeded max does to the plan", () => {
  const seeded = seedBaselinePbs({} as Record<string, unknown>) as { pbs: unknown };

  it("gives every trap bar session in the year a real load", () => {
    setProgrammeContext({ pbs: seeded.pbs as never });
    const prescriptions = new Set<string>();
    for (let week = 1; week <= 52; week += 1) {
      const plan = weekPlan(week, seeded.pbs);
      for (let day = 0; day < 7; day += 1) {
        for (const task of applyBaselineProgramming(buildSession(plan, day), null, day).tasks) {
          if (/^Trap bar deadlift$/.test(String(task.name))) prescriptions.add(String(task.prescription));
        }
      }
    }
    expect(prescriptions.size).toBeGreaterThan(5);
    for (const prescription of prescriptions) {
      expect(prescription, prescription).toMatch(/\d+(\.\d+)? kg/);
      // And says it is an estimate, because it is.
      expect(prescription, prescription).toMatch(/estimated training max/);
    }
  });

  it("leaves the back squat saying it was tested", () => {
    setProgrammeContext({ pbs: seeded.pbs as never });
    const tasks = applyBaselineProgramming(buildSession(weekPlan(3, seeded.pbs), 0), null, 0).tasks;
    const squat = tasks.find((task) => /^Back squat$/.test(String(task.name)));
    expect(squat?.setup).toMatch(/tested 145 kg max/);
  });
});

describe("reading the maxes back", () => {
  it("takes only entries with a usable number on them", () => {
    const maxes = readTrainingMaxes({
      trainingMaxes: {
        lifts: {
          backSquat: { value: 145, kind: "tested" },
          benchPress: { value: 0 },
          pushPress: { value: "heavy" },
          broken: null,
        },
      },
    });
    expect(Object.keys(maxes)).toEqual(["backSquat"]);
    expect(maxes.backSquat).toMatchObject({ value: 145, kind: "tested" });
  });

  it("treats an unrecognised provenance as the athlete's own", () => {
    // Anything not marked tested or derived was typed by someone.
    const maxes = readTrainingMaxes({ trainingMaxes: { lifts: { pushPress: { value: 60 } } } });
    expect(maxes.pushPress.kind).toBe("entered");
  });

  it("survives nonsense rather than throwing", () => {
    for (const value of [undefined, null, 7, "x", { trainingMaxes: { lifts: [] } }]) {
      expect(readTrainingMaxes(value)).toEqual({});
    }
  });
});

describe("editing a max", () => {
  it("records a typed value as the athlete's own", () => {
    const pbs = setTrainingMax({}, "trapBarDeadlift", 165);
    expect(readTrainingMaxes(pbs).trapBarDeadlift).toMatchObject({ value: 165, kind: "entered" });
  });

  it("outranks a derived figure", () => {
    const seeded = seedBaselinePbs({} as Record<string, unknown>) as { pbs: unknown };
    expect(readTrainingMaxes(seeded.pbs).trapBarDeadlift.kind).toBe("derived");
    const edited = setTrainingMax(seeded.pbs, "trapBarDeadlift", 165);
    expect(readTrainingMaxes(edited).trapBarDeadlift).toMatchObject({ value: 165, kind: "entered" });
  });

  it("clearing one puts that lift back on the written fallback", () => {
    const seeded = seedBaselinePbs({} as Record<string, unknown>) as { pbs: unknown };
    const cleared = setTrainingMax(seeded.pbs, "trapBarDeadlift", null);
    expect(readTrainingMaxes(cleared).trapBarDeadlift).toBeUndefined();

    setProgrammeContext({ pbs: cleared as never });
    const tasks = applyBaselineProgramming(buildSession(weekPlan(9, cleared), 2), null, 2).tasks;
    const trap = tasks.find((task) => /^Trap bar deadlift$/.test(String(task.name)));
    expect(trap?.prescription).toMatch(/RPE/);
    expect(trap?.prescription).not.toMatch(/kg/);
  });

  it("refuses a value outside the range rather than clamping it", () => {
    // A clamp would accept 4000 as 400 and put a number nobody meant behind
    // every load in the year.
    const seeded = seedBaselinePbs({} as Record<string, unknown>) as { pbs: unknown };
    for (const bad of [0, 5, 4000, Number.NaN]) {
      expect(readTrainingMaxes(setTrainingMax(seeded.pbs, "backSquat", bad)).backSquat.value).toBe(145);
    }
    expect(isUsableMax(MAX_RANGE[0])).toBe(true);
    expect(isUsableMax(MAX_RANGE[1])).toBe(true);
    expect(isUsableMax(MAX_RANGE[1] + 0.5)).toBe(false);
  });

  it("leaves the other lifts and the rest of pbs alone", () => {
    const pbs = { personalBests: { velocity: 88 }, trainingMaxes: { lifts: { backSquat: { value: 145, kind: "tested" } } } };
    const edited = setTrainingMax(pbs, "benchPress", 95) as typeof pbs & Record<string, unknown>;
    expect(edited.personalBests).toEqual({ velocity: 88 });
    expect(readTrainingMaxes(edited).backSquat).toMatchObject({ value: 145, kind: "tested" });
  });
});

describe("the lifts the screen offers", () => {
  it("covers every key the programme actually reads", () => {
    expect(MAXED_LIFTS.map((lift) => lift.key).sort()).toEqual([
      "backSquat",
      "benchPress",
      "pushPress",
      "trapBarDeadlift",
    ]);
    for (const lift of MAXED_LIFTS) {
      expect(lift.name.trim().length, lift.key).toBeGreaterThan(0);
      expect(lift.drives.trim().length, lift.key).toBeGreaterThan(0);
    }
  });
});
