import { describe, expect, it } from "vitest";
import {
  MIN_POINTS_FOR_TREND,
  bodyweightHistory,
  liftProgress,
  summariseProgress,
  taskNamesForDates,
  velocityHistory,
} from "./progressTrends";
import { dateForWeekDay, weekPlan } from "./programmeSessions";

describe("taskNamesForDates", () => {
  it("names the lifts the overlay adds, not just the extracted ones", () => {
    // The back squat, the depth jump, the RDL and the calf raise exist only
    // after `applyBaselineProgramming` runs. Naming from the raw session left
    // them unidentifiable, so a logged back squat matched nothing: no history
    // on the plan and no line on the progress chart.
    const names = taskNamesForDates([dateForWeekDay(weekPlan(7), 0)]);
    expect(Object.values(names)).toContain("Back squat");
    expect(Object.values(names).some((name) => /Depth jump/.test(name))).toBe(true);
    expect(names["w7-d0-back-squat"]).toBe("Back squat");
  });


  it("names the tasks logged on a date the programme covers", () => {
    const date = dateForWeekDay(weekPlan(1), 0);
    const names = taskNamesForDates([date]);
    expect(Object.keys(names).length).toBeGreaterThan(0);
    // Ids carry the week and day, which is exactly why the map is needed.
    for (const id of Object.keys(names)) expect(id.startsWith("w1-d0")).toBe(true);
  });

  it("returns nothing for a date outside the programme", () => {
    expect(taskNamesForDates(["1999-01-01"])).toEqual({});
  });

  it("returns nothing when nothing was logged", () => {
    expect(taskNamesForDates([])).toEqual({});
  });
});

describe("liftProgress", () => {
  const names = { "w1-d0-squat": "Back squat", "w2-d0-squat": "Back squat", "w1-d0-bench": "Bench press" };

  it("plots one point per day a lift was trained", () => {
    const logs = {
      "2025-01-06": { "w1-d0-squat": [{ reps: 5, kg: 120 }] },
      "2025-01-13": { "w2-d0-squat": [{ reps: 5, kg: 130 }] },
    };
    const [squat] = liftProgress(logs, names);
    expect(squat.name).toBe("Back squat");
    expect(squat.points.map((point) => point.date)).toEqual(["2025-01-06", "2025-01-13"]);
    // Epley: 130 × (1 + 5/30) = 151.7
    expect(squat.points[1].value).toBeCloseTo(151.7, 1);
  });

  it("drops a lift with only one logged day — that is a reading, not a trend", () => {
    const logs = {
      "2025-01-06": { "w1-d0-squat": [{ reps: 5, kg: 120 }], "w1-d0-bench": [{ reps: 5, kg: 80 }] },
      "2025-01-13": { "w2-d0-squat": [{ reps: 5, kg: 130 }] },
    };
    expect(liftProgress(logs, names).map((lift) => lift.name)).toEqual(["Back squat"]);
  });

  it("keeps the heavier of two entries for one lift on one day", () => {
    const logs = {
      "2025-01-06": { "w1-d0-squat": [{ reps: 1, kg: 100 }] },
      "2025-01-13": { "w2-d0-squat": [{ reps: 1, kg: 140 }] },
    };
    const merged = liftProgress(
      { ...logs, "2025-01-06": { "w1-d0-squat": [{ reps: 1, kg: 100 }, { reps: 1, kg: 125 }] } },
      names
    );
    expect(merged[0].points[0].value).toBe(125);
  });

  it("ignores task ids the programme cannot name", () => {
    expect(liftProgress({ d1: { mystery: [{ reps: 5, kg: 100 }] } }, {})).toEqual([]);
  });

  it("puts the busiest lift first", () => {
    const logs = {
      "2025-01-06": { "w1-d0-squat": [{ reps: 3, kg: 120 }], "w1-d0-bench": [{ reps: 3, kg: 80 }] },
      "2025-01-13": { "w2-d0-squat": [{ reps: 3, kg: 125 }] },
      "2025-01-20": { "w1-d0-squat": [{ reps: 3, kg: 130 }], "w1-d0-bench": [{ reps: 3, kg: 82 }] },
    };
    expect(liftProgress(logs, names).map((lift) => lift.name)).toEqual(["Back squat", "Bench press"]);
  });
});

describe("velocityHistory", () => {
  it("takes the fastest pitch of each day", () => {
    const pitches = {
      "2025-03-01": [
        { id: "a", date: "2025-03-01", velocityMph: 84.1 },
        { id: "b", date: "2025-03-01", velocityMph: 86.9 },
      ],
    };
    expect(velocityHistory(pitches, {})).toEqual([{ date: "2025-03-01", value: 86.9 }]);
  });

  it("files a pitch under the day it was thrown, not the day it was imported", () => {
    const pitches = {
      "2025-03-05": [{ id: "a", date: "2025-03-01", velocityMph: 88 }],
    };
    expect(velocityHistory(pitches, {})).toEqual([{ date: "2025-03-01", value: 88 }]);
  });

  it("takes the higher of the pitch log and the check-out figure", () => {
    const pitches = { "2025-03-01": [{ id: "a", date: "2025-03-01", velocityMph: 84 }] };
    const reports = { "2025-03-01": { bestVelocity: 91 } };
    expect(velocityHistory(pitches, reports)).toEqual([{ date: "2025-03-01", value: 91 }]);
  });

  it("keeps a day that has only a check-out figure", () => {
    expect(velocityHistory({}, { "2025-03-02": { bestVelocity: 87.5 } })).toEqual([
      { date: "2025-03-02", value: 87.5 },
    ]);
  });

  it("ignores a zero, which means 'not measured'", () => {
    expect(velocityHistory({}, { "2025-03-02": { bestVelocity: 0 } })).toEqual([]);
  });

  it("returns days oldest first", () => {
    const reports = {
      "2025-03-09": { bestVelocity: 88 },
      "2025-03-02": { bestVelocity: 86 },
    };
    expect(velocityHistory({}, reports).map((point) => point.date)).toEqual([
      "2025-03-02",
      "2025-03-09",
    ]);
  });
});

describe("bodyweightHistory", () => {
  it("reads the weight off both the nested and the flat check-in shapes", () => {
    const pre = {
      "2025-01-06": { inputs: { bodyweightKg: 89.4 } },
      "2025-01-07": { bodyweightKg: 89.1 },
    };
    expect(bodyweightHistory(pre)).toEqual([
      { date: "2025-01-06", value: 89.4 },
      { date: "2025-01-07", value: 89.1 },
    ]);
  });

  it("skips check-ins that carried no weight", () => {
    expect(bodyweightHistory({ "2025-01-06": { inputs: { sleepScore: 80 } } })).toEqual([]);
  });

  it("survives junk in the store", () => {
    expect(bodyweightHistory({ a: null, b: "x", c: 4 } as never)).toEqual([]);
    expect(bodyweightHistory(undefined)).toEqual([]);
  });
});

describe("summariseProgress", () => {
  const points = [
    { date: "2025-01-06", value: 120 },
    { date: "2025-01-13", value: 128 },
    { date: "2025-01-20", value: 125 },
  ];

  it("compares the latest against where the athlete started", () => {
    const summary = summariseProgress(points, { higherIsBetter: true })!;
    expect(summary.latest.value).toBe(125);
    expect(summary.first.value).toBe(120);
    expect(summary.change).toBe(5);
    expect(summary.verdict).toBe("up");
    expect(summary.sessions).toBe(3);
  });

  it("names the high-water mark even when it is not the latest", () => {
    expect(summariseProgress(points, { higherIsBetter: true })!.best).toEqual({
      date: "2025-01-13",
      value: 128,
    });
  });

  it("calls the latest a best when it matches the high-water mark", () => {
    const summary = summariseProgress(
      [...points, { date: "2025-01-27", value: 128 }],
      { higherIsBetter: true }
    )!;
    expect(summary.verdict).toBe("best");
  });

  it("never calls a bodyweight a best — neither direction is good news", () => {
    const summary = summariseProgress(
      [
        { date: "2025-01-06", value: 88 },
        { date: "2025-01-13", value: 90 },
      ],
      { higherIsBetter: null }
    )!;
    expect(summary.verdict).toBe("up");
  });

  it("holds steady inside the noise band rather than reading noise as progress", () => {
    const summary = summariseProgress(
      [
        { date: "2025-01-06", value: 100 },
        { date: "2025-01-13", value: 100.5 },
      ],
      { higherIsBetter: true }
    )!;
    expect(summary.changePct).toBe(0.5);
    expect(summary.verdict).toBe("level");
  });

  it("reports a fall as a fall", () => {
    const summary = summariseProgress(
      [
        { date: "2025-01-06", value: 100 },
        { date: "2025-01-13", value: 90 },
      ],
      { higherIsBetter: true }
    )!;
    expect(summary.verdict).toBe("down");
    expect(summary.change).toBe(-10);
  });

  it("does not call a single reading a best", () => {
    const summary = summariseProgress([{ date: "2025-01-06", value: 100 }], {
      higherIsBetter: true,
    })!;
    expect(summary.verdict).toBe("level");
    expect(summary.sessions).toBe(1);
  });

  it("returns nothing for an empty series", () => {
    expect(summariseProgress([])).toBeNull();
  });

  it("orders an out-of-order series before reading it", () => {
    const summary = summariseProgress(
      [
        { date: "2025-01-20", value: 125 },
        { date: "2025-01-06", value: 120 },
      ],
      { higherIsBetter: true }
    )!;
    expect(summary.first.value).toBe(120);
    expect(summary.latest.value).toBe(125);
  });
});

describe("MIN_POINTS_FOR_TREND", () => {
  it("is two — one point is a dot on an axis", () => {
    expect(MIN_POINTS_FOR_TREND).toBe(2);
  });
});
