import { describe, expect, it } from "vitest";
import {
  bestOneRepMax,
  estimatedOneRepMax,
  isLoggable,
  loggedSetCount,
  loggedTonnage,
  oneRepMaxHistory,
  prescribedSets,
  readDayLog,
} from "./setLog";
import { SessionTask } from "./programmeSessions";

const task = (stageTitle: string, prescription: string) =>
  ({ stageTitle, prescription }) as SessionTask;

describe("isLoggable", () => {
  it("offers logging on lifting work with a set × rep shape", () => {
    expect(isLoggable(task("Strength", "3 × 5 @ 130 kg"))).toBe(true);
    expect(isLoggable(task("Force & power", "4 × 3 @ 94 kg"))).toBe(true);
  });

  it("offers it on the pre-game primer, which carries real loaded work", () => {
    expect(isLoggable(task("Whole-Body Primer", "2 × 3/side @ RPE 5–6"))).toBe(true);
  });

  it("does not offer it on throwing or warm-up", () => {
    expect(isLoggable(task("Throwing", "25 total throws"))).toBe(false);
    expect(isLoggable(task("Prepare", "2 × 10 · low amplitude"))).toBe(false);
  });

  it("does not offer it on lifting with no set × rep shape", () => {
    // A carry or a hold is real work, but not a reps-and-load table.
    expect(isLoggable(task("Strength", "2 × 30 m heavy carry"))).toBe(true);
    expect(isLoggable(task("Strength", "Farmer carry, 40 m"))).toBe(false);
  });
});

describe("prescribedSets", () => {
  it("opens the logger pre-filled from the prescription", () => {
    expect(prescribedSets(task("Strength", "3 × 5 @ 130 kg"))).toEqual([
      { reps: 5, kg: 130 },
      { reps: 5, kg: 130 },
      { reps: 5, kg: 130 },
    ]);
  });

  it("opens a load range at its bottom", () => {
    expect(prescribedSets(task("Strength", "4 × 6 @ 80–90 kg"))[0]).toEqual({ reps: 6, kg: 80 });
  });

  it("opens bodyweight work at zero load rather than refusing", () => {
    expect(prescribedSets(task("Strength", "3 × 8 @ RPE 7"))[0]).toEqual({ reps: 8, kg: 0 });
  });

  it("returns nothing it cannot read", () => {
    expect(prescribedSets(task("Strength", "As many as feel good"))).toEqual([]);
  });
});

describe("readDayLog", () => {
  it("keeps well-formed sets", () => {
    const log = readDayLog({ d: { t1: [{ reps: 5, kg: 130 }] } }, "d");
    expect(log.t1).toEqual([{ reps: 5, kg: 130 }]);
  });

  it("keeps a bodyweight set, where zero load is real", () => {
    expect(readDayLog({ d: { t1: [{ reps: 8, kg: 0 }] } }, "d").t1).toHaveLength(1);
  });

  it("drops a zero-rep set, which is a set that did not happen", () => {
    expect(readDayLog({ d: { t1: [{ reps: 0, kg: 100 }] } }, "d").t1).toBeUndefined();
  });

  it("survives junk from storage", () => {
    for (const junk of ["x", 3, null, [], { t1: "nope" }]) {
      expect(() => readDayLog({ d: junk }, "d")).not.toThrow();
    }
    expect(readDayLog({ d: { t1: "nope" } }, "d")).toEqual({});
  });
});

describe("loggedTonnage", () => {
  it("sums reps × load across every logged set", () => {
    const log = {
      squat: [{ reps: 5, kg: 130 }, { reps: 5, kg: 130 }],
      bench: [{ reps: 6, kg: 80 }],
    };
    expect(loggedTonnage(log)).toBe(1780);
    expect(loggedSetCount(log)).toBe(3);
  });

  it("counts nothing when nothing was logged", () => {
    // The whole point of the change: a day with no log has no tonnage, rather
    // than a plausible number taken from the prescription.
    expect(loggedTonnage({})).toBe(0);
  });

  it("adds nothing for bodyweight sets", () => {
    expect(loggedTonnage({ chin: [{ reps: 8, kg: 0 }] })).toBe(0);
  });
});

describe("estimatedOneRepMax", () => {
  it("returns the load itself for a single", () => {
    expect(estimatedOneRepMax({ reps: 1, kg: 140 })).toBe(140);
  });

  it("applies Epley for low reps", () => {
    // 130 × (1 + 5/30) = 151.67
    expect(estimatedOneRepMax({ reps: 5, kg: 130 })).toBe(151.7);
  });

  it("refuses a high-rep set rather than inflating it", () => {
    // Epley is badly behaved past ten reps; a wrong PB is worse than none.
    expect(estimatedOneRepMax({ reps: 20, kg: 60 })).toBeNull();
  });

  it("returns nothing for bodyweight work", () => {
    expect(estimatedOneRepMax({ reps: 8, kg: 0 })).toBeNull();
  });

  it("takes the best set, not the last", () => {
    expect(bestOneRepMax([{ reps: 5, kg: 100 }, { reps: 3, kg: 120 }])).toBe(132);
  });
});

describe("oneRepMaxHistory", () => {
  it("tracks a lift by name across days, since ids change every session", () => {
    const logs = {
      "2026-08-03": { "w1-d0-3": [{ reps: 5, kg: 130 }] },
      "2026-08-10": { "w2-d0-3": [{ reps: 5, kg: 135 }] },
    };
    const names = { "w1-d0-3": "Back squat", "w2-d0-3": "Back squat" };
    const history = oneRepMaxHistory(logs, names);
    expect(history).toHaveLength(1);
    expect(history[0].name).toBe("Back squat");
    expect(history[0].date).toBe("2026-08-10");
  });

  it("ignores tasks it cannot name", () => {
    expect(oneRepMaxHistory({ d: { unknown: [{ reps: 5, kg: 100 }] } }, {})).toEqual([]);
  });
});

describe("what a reps-and-load table is the wrong record for", () => {
  const gym = (name: string, prescription: string) => ({
    stageTitle: "Whole-Body Force",
    name,
    prescription,
  });

  it("refuses the jumping drills, which have no load to enter", () => {
    // These showed a "Log sets" button and, once progression advice arrived,
    // told the athlete to "pick a load" for a barefoot pogo.
    for (const [name, rx] of [
      ["Depth jump — 15–20 cm box", "3 × 3 · full recovery · contact under 0.25 s"],
      ["Reactive microdose — pogo and low hurdle hops", "Pogo 3 × 10 · low hurdle hops 3 × 4"],
      ["Pogo + vertical jump", "Pogo 2 × 6 · vertical jump 2 × 2"],
    ] as [string, string][]) {
      expect(isLoggable(gym(name, rx)), name).toBe(false);
    }
  });

  it("still logs the lifts, including bodyweight ones that progress by reps", () => {
    expect(isLoggable(gym("Back squat", "3 × 4 @ 120 kg"))).toBe(true);
    expect(isLoggable(gym("Chin-up", "2 × 5 · bodyweight · 2–3 reps in reserve"))).toBe(true);
    expect(isLoggable(gym("Trap bar jump", "3 × 3 @ 30 kg"))).toBe(true);
  });
});
